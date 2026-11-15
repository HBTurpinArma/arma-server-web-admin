var assert = require('assert')
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var underscore = require('underscore')

describe('account copy', function () {
  it('starts a new account with the selected permissions, without copying credentials', function () {
    var root = path.join(__dirname, '..', 'public', 'js')
    var source = fs.readFileSync(path.join(root, 'app', 'views', 'accounts.js'), 'utf8')
    var module = { exports: {} }
    var jquery = function (element) {
      return {
        attr: function (name) {
          if (name === 'data-index') return element.index
          if (name === 'data-group') return element.group
          if (name === 'data-action') return element.action
        },
        prop: function () { return element.checked }
      }
    }
    var dependencies = {
      underscore: underscore,
      jquery: jquery,
      marionette: { ItemView: { extend: function (view) { return view } } },
      'app/password-generator': require('../public/js/app/password-generator'),
      'tpl/accounts.html': fs.readFileSync(path.join(root, 'tpl', 'accounts.html'), 'utf8'),
      'tpl/accounts-content.html': fs.readFileSync(path.join(root, 'tpl', 'accounts-content.html'), 'utf8')
    }
    vm.runInNewContext(source, {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    var html
    var focused = false
    var submitted
    view.accounts = [{ username: 'original', permissions: { accounts: { manage: true }, mods: { view: false } } }]
    view.permissions = { accounts: ['manage'], mods: ['view'] }
    view.editing = 0
    view.$ = function (selector) {
      if (selector === '.accounts-content') return { html: function (value) { html = value } }
      if (selector === '#account-username') return { focus: function () { focused = true }, val: function () { return 'new-user' } }
      if (selector === '#account-password') return { val: function () { return 'new-password' } }
      if (selector === '.permission') {
        return {
          each: function (callback) {
            ;[{ group: 'accounts', action: 'manage', checked: true }, { group: 'mods', action: 'view', checked: false }]
              .forEach(function (item) { callback.call(item) })
          }
        }
      }
    }
    view.copyAccount({ currentTarget: { index: '0' } })
    assert.strictEqual(view.editing, null)
    assert.strictEqual(view.copyDraft.username, undefined)
    assert.strictEqual(view.copyDraft.password, undefined)
    assert.strictEqual(view.copyDraft.permissions.accounts.manage, true)
    assert.strictEqual(focused, true)
    assert(html.indexOf('class="btn btn-default btn-sm copy-account"') !== -1)
    assert(html.indexOf('value="" required') !== -1)
    assert(html.indexOf('autocomplete="new-password" required') !== -1)
    assert(/data-group="accounts" data-action="manage"\s+checked/.test(html))
    assert(!/data-group="mods" data-action="view"\s+checked/.test(html))

    view.request = function (options) { submitted = options }
    view.saveAccount({ preventDefault: function () {} })
    assert.strictEqual(submitted.method, 'POST')
    assert.strictEqual(submitted.url, '/api/accounts')
    var data = JSON.parse(submitted.data)
    assert.strictEqual(data.username, 'new-user')
    assert.strictEqual(data.password, 'new-password')
    assert.strictEqual(data.permissions.accounts.manage, true)
    assert.strictEqual(data.permissions.mods.view, false)

    view.newAccount()
    assert.strictEqual(view.copyDraft, null)
    assert(!/data-group="accounts" data-action="manage"\s+checked/.test(html))
  })

  it('sends Extra Services ticks only when services are configured', function () {
    var root = path.join(__dirname, '..', 'public', 'js')
    var source = fs.readFileSync(path.join(root, 'app', 'views', 'accounts.js'), 'utf8')
    var module = { exports: {} }
    var jquery = function (element) {
      return {
        attr: function (name) { return element[name.replace('data-', '')] },
        prop: function () { return element.checked }
      }
    }
    vm.runInNewContext(source, {
      module: module,
      require: function (name) {
        return {
          underscore: underscore,
          jquery: jquery,
          marionette: { ItemView: { extend: function (view) { return view } } },
          'app/password-generator': require('../public/js/app/password-generator'),
          'tpl/accounts.html': '',
          'tpl/accounts-content.html': ''
        }[name]
      }
    })
    var view = module.exports
    var submitted
    var items = {
      '.permission': [{ group: 'accounts', action: 'manage', checked: false }],
      '.service-permission': [{ service: 'arma3', checked: true }, { service: 'briefing-am2', checked: false }]
    }
    view.accounts = []
    view.permissions = { accounts: ['manage'] }
    view.editing = null
    view.request = function (options) { submitted = JSON.parse(options.data) }
    view.$ = function (selector) {
      if (items[selector]) return { each: function (callback) { items[selector].forEach(function (item) { callback.call(item) }) } }
      return { val: function () { return 'x' } }
    }

    view.services = [{ id: 'arma3' }, { id: 'briefing-am2' }]
    view.saveAccount({ preventDefault: function () {} })
    assert.deepStrictEqual(submitted.permissions.services, { arma3: true, 'briefing-am2': false })

    view.services = []
    view.saveAccount({ preventDefault: function () {} })
    assert.strictEqual(submitted.permissions.services, undefined)
  })
})

describe('account information popovers', function () {
  it('dismisses hints on Escape, restores them on exit, and removes document handlers', function () {
    var root = path.join(__dirname, '..', 'public', 'js')
    var source = fs.readFileSync(path.join(root, 'app', 'views', 'accounts.js'), 'utf8')
    var module = { exports: {} }
    var document = {}
    var handlers
    var removed
    var closed = false
    var info = {
      addClass: function (name) { closed = name === 'info-dismissed' },
      removeClass: function (name) { if (name === 'info-dismissed') closed = false }
    }
    var jquery = function (element) {
      if (element === document) {
        return {
          on: function (events, handler) { handlers = handler },
          off: function (events, handler) { removed = handler }
        }
      }
      return info
    }
    var dependencies = {
      underscore: underscore,
      jquery: jquery,
      marionette: { ItemView: { extend: function (view) { return view } } },
      'app/password-generator': require('../public/js/app/password-generator'),
      'tpl/accounts.html': '',
      'tpl/accounts-content.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      document: document,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.$ = function () { return info }
    view.onShow()
    handlers({ type: 'keydown', key: 'a' })
    assert.strictEqual(closed, false)
    handlers({ type: 'keydown', key: 'Escape' })
    assert.strictEqual(closed, true)
    view.resetInfo({ currentTarget: {} })
    assert.strictEqual(closed, false)
    view.onDestroy()
    assert.strictEqual(removed, handlers)
  })
})
