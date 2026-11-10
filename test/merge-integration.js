var assert = require('assert')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var Module = require('module')
var os = require('os')
var path = require('path')
var request = require('supertest')
var underscore = require('underscore')

describe('merged application routes', function () {
  var app
  var config
  var auditDirectory

  before(function () {
    auditDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-audit-integration-'))
    config = {
      auditLogPath: path.join(auditDirectory, 'audit.log'),
      auth: [{
        username: 'operator',
        password: 'secret',
        permissions: {
          servers: { view: true, edit: false, delete: false },
          missions: { view: true, create: false, delete: false },
          mods: { view: true, delete: false },
          logs: { view: true, delete: false }
        }
      }],
      games: { arma3: { displayName: 'Arma 3' }, reforger: { displayName: 'Arma Reforger' } },
      logFormat: 'combined'
    }
    function Manager () {}
    Manager.prototype = Object.create(EventEmitter.prototype)
    Manager.prototype.load = function () {}
    Manager.prototype.getServers = function () { return [] }
    function Missions () { this.missions = [] }
    Missions.prototype = Object.create(EventEmitter.prototype)
    Missions.prototype.updateMissions = function () {}
    function Mods () { this.mods = [] }
    Mods.prototype = Object.create(EventEmitter.prototype)
    Mods.prototype.updateMods = function () {}
    function Logs () {}
    var original = Module._load
    Module._load = function (name, parent, isMain) {
      if (name === './config' || name === '../config') return config
      if (name === './lib/manager') return Manager
      if (name === './lib/missions') return Missions
      if (name === './lib/mods') return Mods
      if (name === './lib/logs') return Logs
      return original.call(this, name, parent, isMain)
    }
    try {
      app = require('../app')
    } finally {
      Module._load = original
    }
  })

  after(function () {
    if (fs.existsSync(config.auditLogPath)) fs.unlinkSync(config.auditLogPath)
    fs.rmdirSync(auditDirectory)
  })

  it('starts with the retained settings endpoint and enforces account permissions', async function () {
    var login = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'operator', password: 'secret' }).expect(200)
    var cookie = login.headers['set-cookie'][0]
    await request(app).get('/api/settings').set('Cookie', cookie).expect(200)
    await request(app).get('/api/servers').set('Cookie', cookie).expect(200)
    await request(app).get('/api/games').set('Cookie', cookie).expect(200)
    await request(app).post('/api/missions/refresh').set('Cookie', cookie).expect(204)
    await request(app).post('/api/mods/refresh').set('Cookie', cookie).expect(204)
    await request(app).put('/api/servers/one').set('Cookie', cookie).send({ title: 'server' }).expect(403)
    await request(app).delete('/api/servers/one').set('Cookie', cookie).expect(403)
    await request(app).post('/api/servers/one/delete').set('Cookie', cookie).expect(403)
    await request(app).post('/api/servers/one/headlessrefresh').set('Cookie', cookie).expect(403)
    await request(app).delete('/api/logs/example.log').set('Cookie', cookie).expect(403)
    await request(app).delete('/api/missions/example.pbo').set('Cookie', cookie).expect(403)
    await request(app).delete('/api/mods/example').set('Cookie', cookie).expect(403)
  })

  it('exposes usable controls when authentication is disabled', async function () {
    var original = config.auth
    config.auth = null
    try {
      var response = await request(app).get('/api/accounts/me').expect(200)
      assert.strictEqual(response.body.permissions.servers.edit, true)
      assert.strictEqual(response.body.permissions.servers.view, true)
      assert.strictEqual(response.body.permissions.missions.view, true)
      assert.strictEqual(response.body.permissions.mods.view, true)
      assert.strictEqual(response.body.permissions.missions.create, true)
      assert.strictEqual(response.body.permissions.logs.view, true)
      assert.strictEqual(response.body.permissions.logs.delete, true)
      await request(app).get('/api/servers').expect(200)
      await request(app).get('/api/missions').expect(200)
      await request(app).get('/api/mods').expect(200)
    } finally {
      config.auth = original
    }
  })

  it('denies list and refresh routes without the corresponding view permission', async function () {
    var login = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'operator', password: 'secret' }).expect(200)
    var cookie = login.headers['set-cookie'][0]
    var groups = ['servers', 'missions', 'mods']
    try {
      groups.forEach(function (group) { config.auth[0].permissions[group].view = false })
      for (var i = 0; i < groups.length; i++) {
        await request(app).get('/api/' + groups[i]).set('Cookie', cookie).expect(403)
      }
      await request(app).post('/api/missions/refresh').set('Cookie', cookie).expect(403)
      await request(app).post('/api/mods/refresh').set('Cookie', cookie).expect(403)
    } finally {
      groups.forEach(function (group) { config.auth[0].permissions[group].view = true })
    }
  })

  it('allows public mission downloads without exposing the mission list or mutations', async function () {
    var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-download-'))
    var otherDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-other-'))
    var filename = 'mission #100%.pbo'
    var file = path.join(directory, filename)
    var otherFile = path.join(otherDirectory, 'other.pbo')
    var nonMission = path.join(directory, 'secret.txt')
    var originalArmaPath = config.games.arma3.missionPath
    var originalReforgerPath = config.games.reforger.missionPath
    try {
      fs.writeFileSync(file, 'mission contents')
      fs.writeFileSync(otherFile, 'other mission')
      fs.writeFileSync(nonMission, 'private')
      config.games.arma3.missionPath = directory
      config.games.reforger.missionPath = otherDirectory

      var url = '/api/missions/' + encodeURIComponent(filename)
      var response = await request(app).get(url).expect(200)
      assert.strictEqual(response.body.toString(), 'mission contents')
      assert(response.headers['content-disposition'].includes('attachment'))
      await request(app).head(url).expect(200)
      response = await request(app).get('/api/missions/other.pbo/reforger').expect(200)
      assert.strictEqual(response.body.toString(), 'other mission')
      await request(app).get('/api/missions/missing.pbo').expect(404)
      await request(app).get('/api/missions/other.pbo/unknown').expect(404)
      await request(app).get('/api/missions/other.pbo/constructor').expect(404)
      await request(app).get('/api/missions/secret.txt').expect(400)
      await request(app).get('/api/missions/' + encodeURIComponent('../secret.pbo')).expect(400)
      await request(app).get('/api/missions/' + encodeURIComponent('..\\secret.pbo')).expect(400)
      await request(app).get('/api/missions/' + encodeURIComponent('secret.txt:stream.pbo')).expect(400)
      await request(app).get('/api/missions').expect(401)
      await request(app).post('/api/missions').expect(401)
      await request(app).post('/api/missions/refresh').expect(401)
      await request(app).delete(url).expect(401)

      var login = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'operator', password: 'secret' }).expect(200)
      var cookie = login.headers['set-cookie'][0]
      config.auth[0].permissions.missions.view = false
      await request(app).get(url).set('Cookie', cookie).expect(200)
      await request(app).get('/api/missions').set('Cookie', cookie).expect(403)

      var template = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'missions', 'list_item.html'), 'utf8')
      var html = underscore.template(template)({
        game: 'arma3',
        name: filename,
        missionName: 'mission',
        worldName: 'world',
        sizeFormatted: '1 B',
        dateModified: '2026-01-01',
        canDelete: true
      })
      assert(html.includes(url + '/arma3'))
    } finally {
      config.auth[0].permissions.missions.view = true
      config.games.arma3.missionPath = originalArmaPath
      config.games.reforger.missionPath = originalReforgerPath
      fs.unlinkSync(file)
      fs.unlinkSync(otherFile)
      fs.unlinkSync(nonMission)
      fs.rmdirSync(directory)
      fs.rmdirSync(otherDirectory)
    }
  })

  it('records panel mutations and enforces independent audit permission', async function () {
    var login = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'operator', password: 'secret' }).expect(200)
    var cookie = login.headers['set-cookie'][0]
    await request(app).get('/api/audit-log').expect(401)
    await request(app).get('/api/audit-log').set('Cookie', cookie).expect(403)
    await request(app).post('/api/missions/refresh?password=hidden').set('Cookie', cookie).expect(204)
    config.auth[0].permissions.accounts = { manage: true }
    try {
      var result = await request(app).get('/api/audit-log').set('Cookie', cookie).expect(200)
      var entry = result.body.entries.find(function (item) {
        return item.user === 'operator' && item.path === '/api/missions/refresh' && item.status === 204
      })
      assert(entry)
      assert(!JSON.stringify(result.body).includes('password=hidden'))
      assert(!JSON.stringify(result.body).includes('secret'))
      result = await request(app).get('/api/audit-log?user=OPER&action=post%20%2Fapi%2Fmissions').set('Cookie', cookie).expect(200)
      assert(result.body.entries.length > 0)
      assert(result.body.entries.every(function (item) { return item.user === 'operator' && item.method === 'POST' && item.path.indexOf('/api/missions') === 0 }))
      result = await request(app).get('/api/audit-log?user=missing').set('Cookie', cookie).expect(200)
      assert.strictEqual(result.body.entries.length, 0)
      await request(app).get('/api/audit-log?cursor=abc').set('Cookie', cookie).expect(400)
      await request(app).get('/api/audit-log?user[]=x').set('Cookie', cookie).expect(400)
      config.auth[0].permissions.accounts.auditLog = false
      await request(app).get('/api/audit-log').set('Cookie', cookie).expect(403)
      config.auth[0].permissions.accounts.manage = false
      config.auth[0].permissions.accounts.auditLog = true
      await request(app).get('/api/accounts').set('Cookie', cookie).expect(403)
      await request(app).get('/api/audit-log').set('Cookie', cookie).expect(200)
    } finally {
      delete config.auth[0].permissions.accounts
    }
  })
})
