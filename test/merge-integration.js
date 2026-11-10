var assert = require('assert')
var EventEmitter = require('events').EventEmitter
var Module = require('module')
var request = require('supertest')

describe('merged application routes', function () {
  var app
  var config

  before(function () {
    config = {
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
      assert.strictEqual(response.body.permissions.logs.delete, true)
      await request(app).get('/api/servers').expect(200)
      await request(app).get('/api/missions').expect(200)
      await request(app).get('/api/mods').expect(200)
    } finally {
      config.auth = original
    }
  })
})
