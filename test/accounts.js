var assert = require('assert')
var fs = require('fs')
var os = require('os')
var path = require('path')
var express = require('express')
var request = require('supertest')
var setupAuth = require('../lib/session-auth')
var accountsRoute = require('../routes/accounts')

describe('account management', function () {
  var app
  var config
  var file
  var directory
  var adminCookie
  var userCookie

  function permissions (manage) {
    return {
      servers: { view: true, start: false, stop: false, create: false, edit: false, delete: false, rcon: false, updateGame: false },
      missions: { view: false, create: false, delete: false },
      mods: { view: false, delete: false, update: false },
      logs: { view: false, delete: false },
      presets: { edit: false, delete: false },
      accounts: { manage: manage }
    }
  }

  function admin (method, url) {
    return request(app)[method](url).set('Cookie', adminCookie)
  }

  function login (username, password) {
    return request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: username, password: password })
  }

  beforeEach(async function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-accounts-test-'))
    file = path.join(directory, 'accounts.json')
    config = {
      auth: [
        { username: 'admin', password: 'secret', permissions: permissions(true) },
        { username: 'user', password: 'old', permissions: permissions(false) }
      ]
    }
    fs.writeFileSync(file, JSON.stringify(config.auth))
    app = express()
    app.use(express.json())
    setupAuth(config, app)
    app.use('/api/accounts', accountsRoute(config, file))
    var adminLogin = await login('admin', 'secret').expect(200)
    var userLogin = await login('user', 'old').expect(200)
    adminCookie = adminLogin.headers['set-cookie'][0]
    userCookie = userLogin.headers['set-cookie'][0]
  })

  afterEach(function () {
    fs.unlinkSync(file)
    fs.rmdirSync(directory)
  })

  it('only allows explicitly authorized managers to list accounts, without passwords', async function () {
    await request(app).get('/api/accounts').expect(401)
    await request(app).get('/api/accounts').set('Cookie', userCookie).expect(403)
    var response = await admin('get', '/api/accounts').expect(200)
    assert.strictEqual(response.headers['cache-control'], 'no-store')
    assert.strictEqual(response.body.accounts[0].password, undefined)
    assert.strictEqual(response.body.permissions.accounts[0], 'manage')
  })

  it('reports only relevant effective control permissions without exposing credentials', async function () {
    var response = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.deepStrictEqual(response.body.permissions, {
      servers: { view: true, edit: false, delete: false },
      missions: { view: false, create: false, delete: false },
      logs: { view: false, delete: false },
      mods: { view: false }
    })
    assert.strictEqual(response.body.canDeletePresets, false)
    assert.strictEqual(response.body.canUpdateMods, false)
    assert.strictEqual(response.body.canUpdateGame, false)
    assert.strictEqual(response.body.password, undefined)
    config.auth[1].permissions.servers.edit = true
    config.auth[1].permissions.missions.delete = true
    config.auth[1].permissions.missions.create = true
    config.auth[1].permissions.logs.delete = true
    config.auth[1].permissions.logs.view = true
    config.auth[1].permissions.presets.delete = true
    config.auth[1].permissions.mods.update = true
    config.auth[1].permissions.servers.updateGame = true
    response = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.strictEqual(response.body.permissions.servers.edit, true)
    assert.strictEqual(response.body.permissions.missions.delete, true)
    assert.strictEqual(response.body.permissions.missions.create, true)
    assert.strictEqual(response.body.permissions.logs.delete, true)
    assert.strictEqual(response.body.permissions.logs.view, true)
    assert.strictEqual(response.body.canDeletePresets, true)
    assert.strictEqual(response.body.canUpdateMods, true)
    assert.strictEqual(response.body.canUpdateGame, true)
  })

  it('displays and migrates legacy game updater permission when an account is saved', async function () {
    delete config.auth[1].permissions.servers.updateGame
    config.auth[1].permissions.mods.updateGame = true
    fs.writeFileSync(file, JSON.stringify(config.auth))
    var me = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.strictEqual(me.body.canUpdateGame, true)
    var listing = await admin('get', '/api/accounts').expect(200)
    assert(listing.body.permissions.servers.includes('updateGame'))
    assert(!listing.body.permissions.mods.includes('updateGame'))
    var user = listing.body.accounts[1]
    assert.strictEqual(user.permissions.servers.updateGame, true)
    assert.strictEqual(user.permissions.mods.updateGame, undefined)
    user.password = ''
    user.permissions.servers.updateGame = false
    await admin('put', '/api/accounts/user').set('X-Requested-With', 'XMLHttpRequest').send(user).expect(200)
    var saved = JSON.parse(fs.readFileSync(file))[1]
    assert.strictEqual(saved.permissions.servers.updateGame, false)
    assert.strictEqual(saved.permissions.mods.updateGame, undefined)
    me = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.strictEqual(me.body.canUpdateGame, false)
  })

  it('exposes and saves the independent audit permission, preserving legacy manager access', async function () {
    var listing = await admin('get', '/api/accounts').expect(200)
    assert(listing.body.permissions.accounts.includes('auditLog'))
    assert.strictEqual(listing.body.accounts[0].permissions.accounts.auditLog, true)
    assert.strictEqual(listing.body.accounts[1].permissions.accounts.auditLog, false)
    var me = await request(app).get('/api/accounts/me').set('Cookie', adminCookie).expect(200)
    assert.strictEqual(me.body.canViewAuditLog, true)
    var user = listing.body.accounts[1]
    user.password = ''
    user.permissions.accounts.auditLog = true
    await admin('put', '/api/accounts/user').set('X-Requested-With', 'XMLHttpRequest').send(user).expect(200)
    assert.strictEqual(JSON.parse(fs.readFileSync(file))[1].permissions.accounts.auditLog, true)
    me = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.strictEqual(me.body.canManage, false)
    assert.strictEqual(me.body.canViewAuditLog, true)
    user.permissions.accounts.auditLog = false
    await admin('put', '/api/accounts/user').set('X-Requested-With', 'XMLHttpRequest').send(user).expect(200)
    me = await request(app).get('/api/accounts/me').set('Cookie', userCookie).expect(200)
    assert.strictEqual(me.body.canViewAuditLog, false)
    var manager = listing.body.accounts[0]
    manager.password = ''
    manager.permissions.accounts.auditLog = false
    await admin('put', '/api/accounts/admin').set('X-Requested-With', 'XMLHttpRequest').send(manager).expect(200)
    me = await request(app).get('/api/accounts/me').set('Cookie', adminCookie).expect(200)
    assert.strictEqual(me.body.canManage, true)
    assert.strictEqual(me.body.canViewAuditLog, false)
  })

  it('creates, edits, and deletes accounts with immediately updated authentication', async function () {
    var data = { username: 'new', password: 'new-secret', permissions: permissions(false) }
    await admin('post', '/api/accounts').set('X-Requested-With', 'XMLHttpRequest').send(data).expect(200)
    assert.strictEqual(JSON.parse(fs.readFileSync(file))[2].username, 'new')
    var newLogin = await login('new', 'new-secret').expect(200)
    var newCookie = newLogin.headers['set-cookie'][0]
    await request(app).get('/api/accounts/me').set('Cookie', newCookie).expect(200)
    data.username = 'renamed'
    data.password = 'changed'
    data.permissions.accounts.manage = true
    await admin('put', '/api/accounts/new').set('X-Requested-With', 'XMLHttpRequest').send(data).expect(200)
    await request(app).get('/api/accounts/me').set('Cookie', newCookie).expect(401)
    var renamedLogin = await login('renamed', 'changed').expect(200)
    var renamedCookie = renamedLogin.headers['set-cookie'][0]
    var response = await request(app).get('/api/accounts/me').set('Cookie', renamedCookie).expect(200)
    assert.strictEqual(response.body.canManage, true)
    await admin('delete', '/api/accounts/renamed').set('X-Requested-With', 'XMLHttpRequest').expect(200)
    await request(app).get('/api/accounts/me').set('Cookie', renamedCookie).expect(401)
  })

  it('preserves a password and unrecognized fields on edit', async function () {
    config.auth[1].extra = 'keep'
    config.auth[1].permissions.custom = { view: true }
    fs.writeFileSync(file, JSON.stringify(config.auth))
    await admin('put', '/api/accounts/user').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'user', password: '', permissions: permissions(false) }).expect(200)
    assert.strictEqual(config.auth[1].password, 'old')
    assert.strictEqual(config.auth[1].extra, 'keep')
    assert.strictEqual(config.auth[1].permissions.custom.view, true)
  })

  it('rejects invalid requests, duplicates, cross-site forms, and removal of the last manager', async function () {
    var data = { username: 'user', password: 'test', permissions: permissions(false) }
    await admin('post', '/api/accounts').send(data).expect(403)
    await request(app).post('/api/accounts').set('Cookie', userCookie).set('X-Requested-With', 'XMLHttpRequest').send(data).expect(403)
    await admin('post', '/api/accounts').set('X-Requested-With', 'XMLHttpRequest').send(data).expect(409)
    data.username = 'invalid:name'
    await admin('post', '/api/accounts').set('X-Requested-With', 'XMLHttpRequest').send(data).expect(400)
    await admin('delete', '/api/accounts/admin').set('X-Requested-With', 'XMLHttpRequest').expect(400)
    await admin('put', '/api/accounts/admin').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'admin', password: '', permissions: permissions(false) }).expect(400)
  })

  it('does not overwrite externally edited files', async function () {
    fs.writeFileSync(file, JSON.stringify([]))
    await admin('delete', '/api/accounts/user').set('X-Requested-With', 'XMLHttpRequest').expect(409)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file)), [])
    assert.strictEqual(config.auth.length, 2)
  })

  it('does not grant access when authentication is disabled', async function () {
    var openApp = express()
    openApp.use('/api/accounts', accountsRoute({}, file))
    await request(openApp).get('/api/accounts').expect(403)
  })

  it('renders the account form with escaped names and current permissions', function () {
    var template = require('underscore').template(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'accounts-content.html'), 'utf8'))
    var html = template({
      accounts: [{ username: '<user>' }],
      account: { username: '<user>', permissions: permissions(true) },
      permissions: { accounts: ['manage'] },
      editing: true
    })
    assert(html.indexOf('&lt;user&gt;') !== -1)
    assert(html.indexOf('<user>') === -1)
    assert(html.indexOf('checked') !== -1)
    assert(html.indexOf('Leave blank to keep') !== -1)
  })

  it('renders information controls for every available permission and credential field', async function () {
    var response = await admin('get', '/api/accounts').expect(200)
    var template = require('underscore').template(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'accounts-content.html'), 'utf8'))
    var html = template({
      accounts: response.body.accounts,
      account: {},
      permissions: response.body.permissions,
      editing: false
    })
    assert(html.includes('aria-label="Username information"'))
    assert(html.includes('aria-label="Password information"'))
    assert(html.includes('aria-describedby="account-info-username"'))
    assert(html.includes('role="tooltip" id="account-info-username"'))
    assert(html.includes('1-64 letters'))
    assert(html.includes('16-character password'))
    assert(html.includes('A password is required'))
    assert(html.includes('Permissions do not restrict every data channel'))
    Object.keys(response.body.permissions).forEach(function (group) {
      response.body.permissions[group].forEach(function (action) {
        var actionTitle = action === 'updateGame' ? 'Update' : (action === 'auditLog' ? 'Audit Log' : action.charAt(0).toUpperCase() + action.slice(1))
        var title = group.charAt(0).toUpperCase() + group.slice(1) + ' ' + actionTitle
        assert(html.includes('aria-label="' + title + ' permission information"'), title)
        assert(html.includes('role="tooltip" id="account-info-' + group + '-' + action + '"'), title)
      })
    })
    assert(!html.includes('No description is available for this permission.'))
  })
})
