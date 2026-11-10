var assert = require('assert')
var express = require('express')
var fs = require('fs')
var os = require('os')
var path = require('path')
var request = require('supertest')
var vm = require('vm')
var brandingRoute = require('../routes/branding')
var sessionAuth = require('../lib/session-auth')

describe('branding configuration', function () {
  function createApp (branding) {
    var app = express()
    app.get('/branding.js', brandingRoute({ branding: branding }))
    return app
  }

  it('uses defaults when branding is not configured', async function () {
    var response = await request(createApp()).get('/branding.js').expect(200)
    assert(response.text.includes('"title":"Arma Server Admin"'))
    assert(response.text.includes('"navigationTitle":"Arma Server Admin"'))
    assert(response.text.includes('"icon":"/favicon.ico"'))
    assert(response.text.includes('document.title = window.armaBranding.title'))
    assert(response.text.includes('iconLink.href = window.armaBranding.icon'))
    assert.strictEqual(response.headers['cache-control'], 'no-store')
  })

  it('serves configured branding without exposing other config values', async function () {
    var response = await request(createApp({
      title: 'My Panel',
      navigationTitle: '<My Panel>',
      icon: '/my-icon.png',
      secret: 'not public'
    })).get('/branding.js').expect(200)
    assert(response.text.includes('"title":"My Panel"'))
    assert(response.text.includes('"navigationTitle":"\\u003cMy Panel\\u003e"'))
    assert(response.text.includes('"icon":"/my-icon.png"'))
    assert(!response.text.includes('not public'))
  })

  it('updates the page title and existing icon link', async function () {
    var response = await request(createApp({
      title: 'Local Admin',
      navigationTitle: 'Servers',
      icon: '/custom.png'
    })).get('/branding.js').expect(200)
    var iconLink = { parentNode: {} }
    var context = {
      document: {
        querySelector: function () { return iconLink }
      }
    }
    context.window = context
    vm.runInNewContext(response.text, context)
    assert.strictEqual(context.document.title, 'Local Admin')
    assert.strictEqual(iconLink.rel, 'icon')
    assert.strictEqual(iconLink.href, '/custom.png')
    assert.strictEqual(context.armaBranding.navigationTitle, 'Servers')
  })

  it('serves only the configured local icon before authentication', async function () {
    var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'))
    var iconPath = path.join(directory, 'custom icon.png')
    fs.writeFileSync(iconPath, 'icon data')
    try {
      var config = { branding: { icon: '/custom%20icon.png?v=2' }, auth: [{ username: 'admin', password: 'secret' }] }
      var app = express()
      app.use(brandingRoute.icon(config, directory))
      sessionAuth(config, app)
      app.use(express.static(directory))
      var response = await request(app).get('/custom%20icon.png?v=2').expect(200)
      assert.strictEqual(response.headers['content-type'], 'image/png')
      assert.strictEqual(response.body.toString(), 'icon data')
      await request(app).head('/custom%20icon.png?v=2').expect(200)
      await request(app).get('/another.png').expect(302).expect('Location', '/login')
    } finally {
      fs.unlinkSync(iconPath)
      fs.rmdirSync(directory)
    }
  })

  it('serves a valid default favicon before authentication', async function () {
    var app = express()
    app.use(brandingRoute.icon({}, path.join(__dirname, '..', 'public')))
    sessionAuth({ auth: [{ username: 'admin', password: 'secret' }] }, app)
    var response = await request(app).get('/favicon.ico').expect(200)
    assert.strictEqual(response.headers['content-type'], 'image/x-icon')
    assert.deepStrictEqual(Array.from(response.body.slice(0, 4)), [0, 0, 1, 0])
  })

  it('rejects local paths outside the public directory', function () {
    assert.throws(function () {
      brandingRoute.icon({ branding: { icon: '/%2e%2e/private.png' } }, path.join(__dirname, '..', 'public'))
    }, /inside the public directory/)
  })

  it('returns a missing local icon as an error instead of redirecting to sign in', async function () {
    var config = { branding: { icon: '/missing.png' }, auth: [{ username: 'admin', password: 'secret' }] }
    var app = express()
    app.use(brandingRoute.icon(config, path.join(__dirname, '..', 'public')))
    sessionAuth(config, app)
    await request(app).get('/missing.png').expect(404)
  })
})
