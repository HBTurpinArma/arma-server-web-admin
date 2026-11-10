var assert = require('assert')
var express = require('express')
var fs = require('fs')
var os = require('os')
var path = require('path')
var request = require('supertest')
var sessionAuth = require('../lib/session-auth')

describe('preset uploads', function () {
  var app
  var config
  var directory
  var adminCookie
  var userCookie

  beforeEach(async function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-upload-'))
    config = {
      presetsPath: directory,
      auth: [
        { username: 'admin', password: 'secret', permissions: { presets: { edit: true, delete: true } } },
        { username: 'user', password: 'secret', permissions: { presets: { edit: false } } }
      ]
    }
    app = express()
    app.use(express.json())
    sessionAuth(config, app)
    app.use('/api/preset-uploads', require('../routes/preset-uploads')(config))
    var admin = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'admin', password: 'secret' }).expect(200)
    var user = await request(app).post('/api/session').set('X-Requested-With', 'XMLHttpRequest')
      .send({ username: 'user', password: 'secret' }).expect(200)
    adminCookie = admin.headers['set-cookie'][0]
    userCookie = user.headers['set-cookie'][0]
  })

  afterEach(function () {
    fs.readdirSync(directory).forEach(function (name) { fs.unlinkSync(path.join(directory, name)) })
    fs.rmdirSync(directory)
  })

  function upload (cookie, name, content) {
    return request(app).post('/api/preset-uploads').set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest').attach('preset', Buffer.from(content), name)
  }

  it('requires an authenticated preset editor and a same-origin request', async function () {
    await upload('', 'test.html', 'contents').expect(401)
    await upload(userCookie, 'test.html', 'contents').expect(403)
    await request(app).post('/api/preset-uploads').set('Cookie', adminCookie)
      .attach('preset', Buffer.from('contents'), 'test.html').expect(403)
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  it('uploads and replaces a preset, which is listed and served safely', async function () {
    await upload(adminCookie, 'test.html', 'first').expect(200)
    await upload(adminCookie, 'TEST.HTML', '<script>alert(1)</script>').expect(200)
    assert.strictEqual(fs.readFileSync(path.join(directory, 'test.html'), 'utf8'), '<script>alert(1)</script>')
    var publicApp = express()
    publicApp.use('/api/presets', require('../routes/presets')(directory))
    var list = await request(publicApp).get('/api/presets').expect(200)
    assert.deepStrictEqual(list.body, ['test.html'])
    var file = await request(publicApp).get('/api/presets/test.html').expect(200)
    assert.strictEqual(file.headers['content-disposition'], 'attachment')
    assert.strictEqual(file.headers['x-content-type-options'], 'nosniff')
    assert(file.headers['content-security-policy'].includes('sandbox'))
  })

  it('rejects invalid names, empty files, and oversized uploads', async function () {
    await upload(adminCookie, 'bad.txt', 'x').expect(400)
    await upload(adminCookie, 'CON.html', 'x').expect(400)
    await upload(adminCookie, '.hidden.html', 'x').expect(400)
    await upload(adminCookie, 'empty.html', '').expect(400)
    await upload(adminCookie, 'big.html', 'x'.repeat(5 * 1024 * 1024 + 1)).expect(400)
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  it('only deletes launcher files with the separate delete permission', async function () {
    fs.writeFileSync(path.join(directory, 'Preset #1.html'), 'test')
    fs.writeFileSync(path.join(directory, 'other.txt'), 'keep')
    var url = '/api/preset-uploads/' + encodeURIComponent('Preset #1.html')
    await request(app).delete(url).set('X-Requested-With', 'XMLHttpRequest').expect(401)
    await request(app).delete(url).set('Cookie', userCookie).set('X-Requested-With', 'XMLHttpRequest').expect(403)
    config.auth[0].permissions.presets.delete = false
    await request(app).delete(url).set('Cookie', adminCookie).set('X-Requested-With', 'XMLHttpRequest').expect(403)
    config.auth[0].permissions.presets.delete = true
    await request(app).delete(url).set('Cookie', adminCookie).expect(403)
    await request(app).delete('/api/preset-uploads/other.txt').set('Cookie', adminCookie)
      .set('X-Requested-With', 'XMLHttpRequest').expect(400)
    await request(app).delete('/api/preset-uploads/' + encodeURIComponent('../other.html')).set('Cookie', adminCookie)
      .set('X-Requested-With', 'XMLHttpRequest').expect(400)
    assert.strictEqual(fs.existsSync(path.join(directory, 'Preset #1.html')), true)
    await request(app).delete(url).set('Cookie', adminCookie).set('X-Requested-With', 'XMLHttpRequest').expect(200)
    await request(app).delete(url).set('Cookie', adminCookie).set('X-Requested-With', 'XMLHttpRequest').expect(404)
    assert.strictEqual(fs.readFileSync(path.join(directory, 'other.txt'), 'utf8'), 'keep')
  })
})
