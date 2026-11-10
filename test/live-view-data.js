var assert = require('assert')
var express = require('express')
var http = require('http')
var request = require('supertest')
var socketIO = require('socket.io')
var socketClient = require('socket.io-client')
var createLiveViewData = require('../lib/live-view-data')
var setupAuth = require('../lib/session-auth')

describe('permission-filtered live data', function () {
  function socket (username) {
    return {
      request: { session: username ? { user: username } : null },
      messages: {},
      emit: function (name, data) { this.messages[name] = data }
    }
  }

  it('filters initial snapshots, broadcasts and permission changes per account', function () {
    var config = {
      auth: [
        { username: 'operator', permissions: { servers: { view: true }, missions: { view: false }, mods: { view: true } } },
        { username: 'limited', permissions: { servers: { view: false }, missions: { view: true }, mods: { view: false } } }
      ]
    }
    var operator = socket('operator')
    var limited = socket('limited')
    var unknown = socket('missing')
    var io = {
      sockets: { connected: { operator: operator, limited: limited, unknown: unknown } },
      on: function (name, callback) { this.connect = callback }
    }
    var lists = { servers: ['server'], missions: ['mission'], mods: ['mod'] }
    var live = createLiveViewData(io, config, {
      servers: function () { return lists.servers },
      missions: function () { return lists.missions },
      mods: function () { return lists.mods },
      settings: function () { return { type: 'linux' } }
    })
    io.connect(operator)
    io.connect(limited)
    io.connect(unknown)
    assert.deepStrictEqual(operator.messages.servers, ['server'])
    assert.deepStrictEqual(operator.messages.missions, [])
    assert.deepStrictEqual(operator.messages.mods, ['mod'])
    assert.deepStrictEqual(limited.messages.servers, [])
    assert.deepStrictEqual(limited.messages.missions, ['mission'])
    assert.deepStrictEqual(limited.messages.mods, [])
    assert.deepStrictEqual(unknown.messages.servers, [])
    assert.deepStrictEqual(unknown.messages.settings, { type: 'linux' })

    lists.servers = ['updated']
    live.broadcast('servers')
    assert.deepStrictEqual(operator.messages.servers, ['updated'])
    assert.deepStrictEqual(limited.messages.servers, [])

    config.auth[0].permissions.servers.view = false
    config.auth[1].permissions.servers.view = true
    live.refresh()
    assert.deepStrictEqual(operator.messages.servers, [])
    assert.deepStrictEqual(limited.messages.servers, ['updated'])
    assert(Object.prototype.hasOwnProperty.call(operator.messages, 'permissions-changed'))

    config.auth = null
    live.refresh()
    assert.deepStrictEqual(unknown.messages.servers, ['updated'])
    assert.deepStrictEqual(unknown.messages.missions, ['mission'])
    assert.deepStrictEqual(unknown.messages.mods, ['mod'])
  })

  it('uses the authenticated socket session and updates access without reconnecting', async function () {
    var config = {
      auth: [{
        username: 'operator',
        password: 'secret',
        permissions: { servers: { view: false }, missions: { view: true }, mods: { view: false } }
      }]
    }
    var app = express()
    var server = http.createServer(app)
    var io = socketIO(server)
    app.use(express.json())
    setupAuth(config, app, io)
    var live = createLiveViewData(io, config, {
      servers: function () { return ['server'] },
      missions: function () { return ['mission'] },
      mods: function () { return ['mod'] },
      settings: function () { return {} }
    })
    var client
    try {
      await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve) })
      var login = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'operator', password: 'secret' }).expect(200)
      var messages = {}
      client = socketClient('http://127.0.0.1:' + server.address().port, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { Cookie: login.headers['set-cookie'][0] }
      })
      ;['servers', 'missions', 'mods'].forEach(function (name) {
        client.on(name, function (data) { messages[name] = data })
      })
      await new Promise(function (resolve, reject) {
        client.on('settings', resolve)
        client.on('error', reject)
      })
      assert.deepStrictEqual(messages.servers, [])
      assert.deepStrictEqual(messages.missions, ['mission'])
      assert.deepStrictEqual(messages.mods, [])
      config.auth[0].permissions.servers.view = true
      config.auth[0].permissions.missions.view = false
      var changed = new Promise(function (resolve) { client.once('permissions-changed', resolve) })
      live.refresh()
      await changed
      assert.deepStrictEqual(messages.servers, ['server'])
      assert.deepStrictEqual(messages.missions, [])
    } finally {
      if (client) client.close()
      await new Promise(function (resolve) { io.close(resolve) })
    }
  })
})
