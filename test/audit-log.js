var assert = require('assert')
var express = require('express')
var fs = require('fs')
var multer = require('multer')
var os = require('os')
var path = require('path')
var request = require('supertest')
var underscore = require('underscore')
var vm = require('vm')
var createAuditLog = require('../lib/audit-log')

describe('panel audit log', function () {
  var directory
  var file

  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-audit-test-'))
    file = path.join(directory, 'audit.log')
  })

  afterEach(function () {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    fs.rmdirSync(directory)
  })

  it('records changes, failures and selected targets without request secrets', async function () {
    var audit = createAuditLog(file)
    var app = express()
    app.use(express.json())
    app.use(function (req, res, next) { req.auth = { user: 'alice' }; next() })
    app.use('/api', audit.middleware)
    app.post('/api/accounts', function (req, res) { res.json({ success: true }) })
    app.delete('/api/logs/:name', function (req, res) { res.status(403).send('Denied') })
    app.get('/api/accounts', function (req, res) { res.send('view') })
    await request(app).get('/api/accounts').expect(200)
    assert(!fs.existsSync(file))
    await request(app).post('/api/accounts?token=private')
      .send({ username: 'bob', password: 'private-password', permissions: { secret: true } }).expect(200)
    await request(app).delete('/api/logs/example.rpt').expect(403)
    var saved = fs.readFileSync(file, 'utf8')
    assert(!saved.includes('private'))
    var entries = createAuditLog(file).read().entries
    assert.strictEqual(entries.length, 2)
    assert.strictEqual(entries[0].user, 'alice')
    assert.strictEqual(entries[0].status, 403)
    assert.strictEqual(entries[1].path, '/api/accounts')
    assert.deepStrictEqual(entries[1].details, { username: 'bob' })
  })

  it('reads all events newest-first across byte-cursor pages and UTF-8 block boundaries', function () {
    var lines = []
    for (var i = 0; i < 205; i++) {
      lines.push(JSON.stringify({ index: i, user: 'user-' + '\u00e9'.repeat(120) }))
    }
    fs.writeFileSync(file, lines.join('\n') + '\n')
    var audit = createAuditLog(file)
    var seen = []
    var cursor
    do {
      var page = audit.read(cursor)
      seen = seen.concat(page.entries)
      cursor = page.nextCursor
    } while (cursor !== null)
    assert.strictEqual(seen.length, 205)
    seen.forEach(function (entry, index) {
      assert.strictEqual(entry.index, 204 - index)
      assert.strictEqual(entry.user, 'user-' + '\u00e9'.repeat(120))
    })
    assert.throws(function () { audit.read(9999999) }, /Invalid audit log cursor/)
  })

  it('records uploaded filenames without storing file contents', async function () {
    var audit = createAuditLog(file)
    var app = express()
    app.use(function (req, res, next) { req.auth = { user: 'alice' }; next() })
    app.use('/api', audit.middleware)
    app.post('/api/missions', multer().array('missions', 64), function (req, res) {
      res.send('uploaded')
    })
    await request(app).post('/api/missions')
      .field('game', 'arma3')
      .attach('missions', Buffer.from('private file content'), 'example.pbo')
      .expect(200)
    var entry = audit.read().entries[0]
    assert.deepStrictEqual(entry.details, { game: 'arma3', files: ['example.pbo'] })
    assert(!fs.readFileSync(file, 'utf8').includes('private file content'))
  })

  it('filters the entire history across bounded scan and result pages', function () {
    var lines = []
    for (var i = 0; i < 430; i++) {
      lines.push(JSON.stringify({
        index: i,
        user: i % 2 ? 'Alice' : 'Bob',
        method: i % 3 ? 'POST' : 'DELETE',
        path: '/api/servers/server-' + i,
        padding: 'x'.repeat(4000)
      }))
    }
    fs.writeFileSync(file, lines.join('\n') + '\n')
    var audit = createAuditLog(file)
    var all = []
    var cursor
    var batches = 0
    do {
      var page = audit.read(cursor, { user: 'ALIC', action: 'delete /API/servers' })
      assert(page.entries.length <= 100)
      all = all.concat(page.entries)
      cursor = page.nextCursor
      batches++
    } while (cursor !== null)
    assert(batches > 1)
    var expected = []
    for (var j = 429; j >= 0; j--) if (j % 2 && j % 3 === 0) expected.push(j)
    assert.deepStrictEqual(all.map(function (entry) { return entry.index }), expected)
    var noMatches = audit.read(undefined, { user: 'nobody' })
    assert.strictEqual(noMatches.entries.length, 0)
    assert.notStrictEqual(noMatches.nextCursor, null)
  })

  it('reports write and read failures rather than hiding them', async function () {
    var audit = createAuditLog(path.join(directory, 'missing', 'audit.log'))
    var app = express()
    app.use('/api', audit.middleware)
    app.post('/api/change', function (req, res) { res.send('done') })
    var original = console.error
    var errors = []
    console.error = function () { errors.push(Array.prototype.slice.call(arguments)) }
    try {
      var response = await request(app).post('/api/change').expect(200)
      assert.strictEqual(response.headers['x-audit-log-error'], 'Unable to save audit event')
      assert.strictEqual(errors.length, 1)
    } finally {
      console.error = original
    }
    fs.writeFileSync(file, 'not json\n')
    assert.throws(function () { createAuditLog(file).read() }, SyntaxError)
  })

  it('escapes recorded values when rendering audit rows', function () {
    var html = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'audit-log-rows.html'), 'utf8')
    var render = underscore.template(html)
    var result = render({
      entries: [{
        time: '2026-01-01T00:00:00Z',
        user: '<script>',
        method: 'POST',
        path: '/api/<script>',
        details: { name: '<script>' },
        status: 200,
        aborted: false
      }]
    })
    assert(!result.includes('<script>'))
    assert(result.includes('&lt;script&gt;'))
  })

  it('clears displayed events and aborts requests when permissions change', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'audit-log.js'), 'utf8')
    var module = { exports: {} }
    var state = { status: 'loading', canViewAuditLog: false, emptied: 0, hidden: 0, aborted: 0 }
    var permissions = {
      get: function (key) { return key === 'permissionsStatus' ? state.status : state.canViewAuditLog }
    }
    var dependencies = {
      jquery: {},
      underscore: underscore,
      marionette: { ItemView: { extend: function (view) { return view } } },
      'app/permissions': permissions,
      'tpl/audit-log.html': '',
      'tpl/audit-log-rows.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.isRendered = true
    view.request = { abort: function () { state.aborted++ } }
    view.$ = function (selector) {
      return {
        empty: function () { state.emptied++ },
        hide: function () { state.hidden++ },
        text: function (value) { state.message = value },
        prop: function (name, value) { state.disabled = value }
      }
    }
    view.updatePermission()
    assert.strictEqual(state.aborted, 1)
    assert.strictEqual(state.emptied, 1)
    assert.strictEqual(state.hidden, 1)
    assert.strictEqual(state.disabled, true)
    assert.strictEqual(state.message, 'Checking account permissions...')
    state.status = 'ready'
    view.updatePermission()
    assert(state.message.includes('do not have permission'))
    var refreshed = false
    view.refresh = function () { refreshed = true }
    state.canViewAuditLog = true
    view.updatePermission()
    assert(refreshed)
  })

  it('submits filters and continues through empty scan batches before showing matches', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'audit-log.js'), 'utf8')
    var module = { exports: {} }
    var requests = []
    var state = { user: ' Alice ', action: ' DELETE ', appended: [], status: '' }
    var jquery = {
      ajax: function (options) {
        var call = { options: options }
        requests.push(call)
        return {
          done: function (fn) { call.done = fn; return this },
          fail: function (fn) { call.fail = fn; return this },
          always: function (fn) { call.always = fn; return this },
          abort: function () { call.fail({}, 'abort'); call.always() }
        }
      }
    }
    var dependencies = {
      jquery: jquery,
      underscore: underscore,
      marionette: { ItemView: { extend: function (view) { return view } } },
      'app/permissions': {},
      'tpl/audit-log.html': '',
      'tpl/audit-log-rows.html': '<%= entries.length %>'
    }
    vm.runInNewContext(source, {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.$ = function (selector) {
      return {
        val: function () { return selector === '#audit-user' ? state.user : state.action },
        empty: function () { state.appended = [] },
        hide: function () {},
        toggle: function (value) { state.more = value },
        prop: function () {},
        text: function (value) { state.status = value },
        append: function (value) { state.appended.push(value) }
      }
    }
    var prevented = false
    view.applyFilter({ preventDefault: function () { prevented = true } })
    assert(prevented)
    assert.strictEqual(requests[0].options.data.user, 'Alice')
    assert.strictEqual(requests[0].options.data.action, 'DELETE')
    requests[0].done({ entries: [], nextCursor: 123 })
    requests[0].always()
    assert.strictEqual(requests[1].options.data.cursor, 123)
    assert.strictEqual(requests[1].options.data.user, 'Alice')
    requests[1].done({ entries: [{}], nextCursor: 45 })
    requests[1].always()
    assert.strictEqual(state.more, true)
    view.loadMore()
    assert.strictEqual(requests[2].options.data.cursor, 45)
    assert.strictEqual(requests[2].options.data.action, 'DELETE')
    requests[2].done({ entries: [], nextCursor: null })
    requests[2].always()
    assert.strictEqual(state.status, 'No more matching audit events.')
    assert.strictEqual(state.more, false)
  })
})
