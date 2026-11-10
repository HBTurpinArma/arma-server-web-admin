var assert = require('assert')
var express = require('express')
var http = require('http')
var request = require('supertest')
var socketIO = require('socket.io')
var socketClient = require('socket.io-client')
var sessionAuth = require('../lib/session-auth')
var accountsRoute = require('../routes/accounts')

describe('session authentication', function () {
  var app
  var server
  var io
  var config
  var auth

  beforeEach(function () {
    config = { auth: [{ username: 'admin', password: 'secret', permissions: { accounts: { manage: true } } }] }
    app = express()
    server = http.createServer(app)
    io = socketIO(server)
    app.use(express.json())
    auth = sessionAuth(config, app, io)
    app.use('/api/accounts', accountsRoute(config, 'unused'))
    app.get('/private', function (req, res) { res.send('private') })
    app.post('/api/action', function (req, res) { res.send('ok') })
  })

  afterEach(function (done) {
    if (server.listening) io.close(done)
    else { io.close(); done() }
  })

  function login (username, password) {
    return request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: username, password: password })
  }

  it('accepts a legacy single-account configuration', async function () {
    var legacyApp = express()
    var legacyConfig = { auth: { username: 'legacy', password: 'secret' } }
    legacyApp.use(express.json())
    sessionAuth(legacyConfig, legacyApp)
    assert.strictEqual(legacyConfig.auth[0].permissions.servers.edit, true)
    assert.strictEqual(legacyConfig.auth[0].permissions.logs.delete, true)
    legacyApp.get('/private', function (req, res) { res.send(req.auth.user) })
    var response = await request(legacyApp).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'legacy', password: 'secret' }).expect(200)
    await request(legacyApp).get('/private').set('Cookie', response.headers['set-cookie'][0]).expect(200, 'legacy')
  })

  it('signs in, identifies the account, and invalidates a copied cookie on logout', async function () {
    await request(app).get('/private').expect(302).expect('Location', '/login')
    await request(app).get('/api/accounts/me').expect(401)
    await login('admin', 'wrong').expect(401)
    await request(app).post('/api/session').send({ username: 'admin', password: 'secret' }).expect(403)
    var response = await login('admin', 'secret').expect(200)
    var cookie = response.headers['set-cookie'][0]
    assert(cookie.includes('HttpOnly'))
    assert(cookie.includes('SameSite=Lax'))
    var me = await request(app).get('/api/accounts/me').set('Cookie', cookie).expect(200)
    assert.strictEqual(me.body.username, 'admin')
    assert.strictEqual(me.body.canManage, true)
    await request(app).post('/api/action').set('Cookie', cookie).set('Origin', 'https://other.example').expect(403)
    await request(app).post('/api/session/logout').set('Cookie', cookie).expect(403)
    await request(app).post('/api/session/logout').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').expect(200)
    await request(app).get('/api/accounts/me').set('Cookie', cookie).expect(401)
    await request(app).get('/private').set('Cookie', cookie).expect(302)
  })

  it('revokes sessions when an account password changes or an account is removed', async function () {
    var response = await login('admin', 'secret').expect(200)
    var cookie = response.headers['set-cookie'][0]
    config.auth[0].password = 'changed'
    await request(app).get('/api/accounts/me').set('Cookie', cookie).expect(401)
    response = await login('admin', 'changed').expect(200)
    cookie = response.headers['set-cookie'][0]
    config.auth.length = 0
    await request(app).get('/api/accounts/me').set('Cookie', cookie).expect(401)
  })

  it('only logs out the current session', async function () {
    var first = await login('admin', 'secret').expect(200)
    var second = await login('admin', 'secret').expect(200)
    await request(app).post('/api/session/logout').set('Cookie', first.headers['set-cookie'][0])
      .set('X-Requested-With', 'XMLHttpRequest').expect(200)
    await request(app).get('/api/accounts/me').set('Cookie', first.headers['set-cookie'][0]).expect(401)
    await request(app).get('/api/accounts/me').set('Cookie', second.headers['set-cookie'][0]).expect(200)
  })

  it('rejects unauthenticated sockets and disconnects a logged-out session', function (done) {
    server.listen(0, '127.0.0.1', function () {
      var url = 'http://127.0.0.1:' + server.address().port
      var rejected = socketClient(url, { transports: ['websocket'], forceNew: true, reconnection: false })
      rejected.on('connect', function () { done(new Error('Unauthenticated socket connected')) })
      rejected.on('error', function () {
        rejected.close()
        login('admin', 'secret').expect(200).then(function (response) {
          var cookie = response.headers['set-cookie'][0]
          var client = socketClient(url, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            extraHeaders: { Cookie: cookie }
          })
          client.on('connect', function () {
            client.on('disconnect', function () { client.close(); done() })
            request(app).post('/api/session/logout').set('Cookie', cookie)
              .set('X-Requested-With', 'XMLHttpRequest').expect(200).catch(done)
          })
          client.on('error', done)
        }).catch(done)
      })
    })
  })

  it('disconnects sockets whose account credentials change', function (done) {
    server.listen(0, '127.0.0.1', function () {
      var url = 'http://127.0.0.1:' + server.address().port
      login('admin', 'secret').expect(200).then(function (response) {
        var client = socketClient(url, {
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
          extraHeaders: { Cookie: response.headers['set-cookie'][0] }
        })
        client.on('connect', function () {
          client.on('disconnect', function () { client.close(); done() })
          config.auth[0].password = 'changed'
          auth.disconnectInvalid()
        })
        client.on('error', done)
      }).catch(done)
    })
  })
})
