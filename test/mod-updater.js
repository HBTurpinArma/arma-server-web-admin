var assert = require('assert')
var childProcess = require('child_process')
var express = require('express')
var fs = require('fs')
var path = require('path')
var request = require('supertest')
var underscore = require('underscore')
var vm = require('vm')
var createUpdater = require('../lib/mod-updater')
var setupAuth = require('../lib/session-auth')

describe('mod updater', function () {
  function waitUntil (condition) {
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + 5000
      function check () {
        if (condition()) return resolve()
        if (Date.now() >= deadline) return reject(new Error('Timed out waiting for updater'))
        setTimeout(check, 20)
      }
      check()
    })
  }

  it('streams output, prevents overlapping jobs and refreshes only on success', async function () {
    var originalSpawn = childProcess.spawn
    var spawnOptions
    var refreshes = 0
    childProcess.spawn = function (command, args, options) {
      spawnOptions = { command: command, args: args, options: options }
      return originalSpawn(process.execPath, ['-e',
        "process.stdout.write('first\\n'); setTimeout(function () { process.stderr.write('second\\n'); process.exit(0) }, 300)"],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    }
    try {
      var script = path.join(__dirname, 'fixture-updater.py')
      var gameScript = path.join(__dirname, 'fixture-game.py')
      var updater = createUpdater({ python: 'python-test', script: script, gameScript: gameScript }, function () { refreshes++ })
      assert.strictEqual(updater.start().status, 202)
      assert.deepStrictEqual(spawnOptions.args, ['-u', script])
      assert.strictEqual(spawnOptions.options.cwd, __dirname)
      assert.strictEqual(spawnOptions.options.shell, undefined)
      assert.strictEqual(updater.start().status, 409)
      assert.strictEqual(updater.start('game').status, 409)
      await waitUntil(function () { return updater.snapshot().output.includes('first') })
      assert.strictEqual(updater.snapshot().running, true)
      await waitUntil(function () { return !updater.snapshot().running })
      assert.strictEqual(updater.snapshot().status, 'completed')
      assert(updater.snapshot().output.includes('second'))
      assert.strictEqual(refreshes, 1)
      assert.strictEqual(updater.start('game').status, 202)
      assert.deepStrictEqual(spawnOptions.args, ['-u', gameScript])
      assert.strictEqual(updater.snapshot().type, 'game')
      assert.strictEqual(updater.start('mods').status, 409)
      await waitUntil(function () { return !updater.snapshot().running })
      assert.strictEqual(updater.snapshot().status, 'completed')
      assert.strictEqual(refreshes, 1)
    } finally {
      childProcess.spawn = originalSpawn
    }
  })

  it('reports startup and exit failures without refreshing mods', async function () {
    var refreshes = 0
    var missing = createUpdater({ python: path.join(__dirname, 'missing-executable'), script: path.join(__dirname, 'fixture.py') }, function () { refreshes++ })
    missing.start()
    await waitUntil(function () { return !missing.snapshot().running })
    assert.strictEqual(missing.snapshot().status, 'failed')
    assert(missing.snapshot().output.includes('Unable to run updater'))
    assert.strictEqual(refreshes, 0)
    assert.strictEqual(createUpdater(null).start().status, 503)
    assert.strictEqual(createUpdater({ python: 'python', script: 'relative.py' }).start().status, 500)
  })

  it('limits retained output and reports nonzero exit codes', async function () {
    var originalSpawn = childProcess.spawn
    var refreshes = 0
    childProcess.spawn = function () {
      return originalSpawn(process.execPath, ['-e',
        "process.stdout.write('x'.repeat(300000), function () { process.exit(7) })"],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    }
    try {
      var updater = createUpdater({ python: 'python-test', script: path.join(__dirname, 'fixture.py') }, function () { refreshes++ })
      updater.start()
      await waitUntil(function () { return !updater.snapshot().running })
      var state = updater.snapshot()
      assert.strictEqual(state.status, 'failed')
      assert.strictEqual(state.truncated, true)
      assert.strictEqual(state.output.length, 256 * 1024)
      assert(state.output.includes('exited with code 7'))
      assert.strictEqual(refreshes, 0)
    } finally {
      childProcess.spawn = originalSpawn
    }
  })

  it('requires the separate permission for starting and reading output', async function () {
    var config = {
      auth: [
        { username: 'updater', password: 'secret', permissions: { mods: { update: true } } },
        { username: 'viewer', password: 'secret', permissions: { mods: { view: true } } },
        { username: 'game', password: 'secret', permissions: { servers: { updateGame: true } } },
        { username: 'legacy', password: 'secret', permissions: { mods: { updateGame: true } } }
      ]
    }
    var starts = 0
    var type = 'game'
    var app = express()
    app.use(express.json())
    setupAuth(config, app)
    app.use('/api/mod-updater', require('../routes/mod-updater')(config, {
      snapshot: function () { return { configured: true, gameConfigured: true, running: false, status: 'completed', type: type, output: 'private output' } },
      start: function () { starts++; return { status: 202 } }
    }))
    async function login (username) {
      var response = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: username, password: 'secret' }).expect(200)
      return response.headers['set-cookie'][0]
    }
    var allowed = await login('updater')
    var denied = await login('viewer')
    var game = await login('game')
    var legacy = await login('legacy')
    await request(app).get('/api/mod-updater').expect(401)
    await request(app).get('/api/mod-updater').set('Cookie', denied).expect(403)
    await request(app).post('/api/mod-updater').set('Cookie', denied).set('X-Requested-With', 'XMLHttpRequest').expect(403)
    await request(app).post('/api/mod-updater').set('Cookie', allowed).expect(403)
    var hidden = await request(app).get('/api/mod-updater').set('Cookie', allowed).expect(200)
    assert.strictEqual(hidden.body.output, '')
    assert.strictEqual(hidden.body.outputRestricted, true)
    var visible = await request(app).get('/api/mod-updater').set('Cookie', game).expect(200)
    assert.strictEqual(visible.body.output, 'private output')
    await request(app).get('/api/mod-updater').set('Cookie', legacy).expect(200)
    config.auth[3].permissions.servers = { updateGame: false }
    await request(app).get('/api/mod-updater').set('Cookie', legacy).expect(403)
    await request(app).post('/api/mod-updater/game').set('Cookie', allowed).set('X-Requested-With', 'XMLHttpRequest').expect(403)
    await request(app).post('/api/mod-updater').set('Cookie', game).set('X-Requested-With', 'XMLHttpRequest').expect(403)
    await request(app).post('/api/mod-updater/game').set('Cookie', game).set('X-Requested-With', 'XMLHttpRequest').expect(202)
    await request(app).post('/api/mod-updater').set('Cookie', allowed).set('X-Requested-With', 'XMLHttpRequest').expect(202)
    config.auth[0].permissions.mods.update = false
    await request(app).get('/api/mod-updater').set('Cookie', allowed).expect(403)
    assert.strictEqual(starts, 2)
    config.auth = null
    await request(app).post('/api/mod-updater').set('X-Requested-With', 'XMLHttpRequest').expect(403)
  })

  it('places the update panel below preset upload', function () {
    var html = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'mods', 'list.html'), 'utf8')
    assert(html.indexOf('upload-preset-heading') < html.indexOf('update-mods-heading'))
    assert(html.indexOf('update-mods-heading') < html.indexOf('col-sm-8 mods-overview-presets'))
    assert(html.includes('class="mod-update-output"'))
    assert(html.includes('update-game'))
  })

  it('renders output as text and stops polling after the view is destroyed', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'mods', 'list.js'), 'utf8')
    var module = { exports: {} }
    var onSuccess
    var timer
    var output
    var disabled = {}
    var element = { scrollTop: 0, scrollHeight: 0, clientHeight: 100 }
    var dependencies = {
      jquery: { getJSON: function () { return { done: function (fn) { onSuccess = fn; return { fail: function () {} } } } } },
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/mods/list_item': {},
      'tpl/mods/list.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      require: function (name) { return dependencies[name] },
      setTimeout: function (fn) { timer = fn; return 42 },
      clearTimeout: function () { timer = null }
    })
    var view = module.exports
    view.updaterGeneration = 1
    view.canUpdateMods = true
    view.canUpdateGame = true
    view.$ = function (selector) {
      if (selector === '.mod-update-output') return { get: function () { return element }, text: function (value) { output = value } }
      if (selector === '.mod-update-status') return { text: function () {} }
      if (selector === '.update-mods' || selector === '.update-game') {
        return {
          prop: function (name, value) { disabled[selector] = value },
          attr: function () {}
        }
      }
    }
    view.pollModUpdate(1)
    onSuccess({ configured: true, gameConfigured: true, running: false, status: 'idle', output: '', truncated: false })
    assert.strictEqual(disabled['.update-mods'], false)
    assert.strictEqual(disabled['.update-game'], false)
    onSuccess({ configured: true, gameConfigured: true, running: true, status: 'running', type: 'game', output: '<script>bad</script>', truncated: false })
    assert.strictEqual(output, '<script>bad</script>')
    assert.strictEqual(disabled['.update-mods'], true)
    assert.strictEqual(disabled['.update-game'], true)
    assert.strictEqual(typeof timer, 'function')
    view.onDestroy()
    assert.strictEqual(timer, null)
    onSuccess({ configured: true, running: false, status: 'completed', output: 'stale' })
    assert.strictEqual(output, '<script>bad</script>')
  })
})
