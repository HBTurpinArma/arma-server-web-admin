var assert = require('assert')
var fs = require('fs')
var path = require('path')
var template = require('underscore').template(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'navigation.html'), 'utf8'))
var vm = require('vm')

describe('account navigation', function () {
  it('shows an escaped account name and logout control for signed-in users', function () {
    var html = template({ username: '<admin>', canManageAccounts: true, canViewAuditLog: true, darkMode: true, isActiveRoute: function () { return '' }, isServersActive: function () { return '' } })
    assert(html.includes('Signed in as'))
    assert(html.includes('&lt;admin&gt;'))
    assert(!html.includes('<admin>'))
    assert(html.includes('account-logout'))
    assert(html.includes('href="#accounts"'))
    assert(html.includes('href="#audit-log"'))
    assert(html.includes('>Audit Log</a>'))
    assert(html.includes('Account Management'))
    assert(html.indexOf('href="#missions"') < html.indexOf('class="divider"'))
    assert(html.indexOf('href="#mods"') < html.indexOf('class="divider"'))
    assert(html.indexOf('href="#logs"') < html.indexOf('class="divider"'))
    assert(html.indexOf('id="servers-list"') > html.indexOf('class="divider"'))
    assert(html.indexOf('Settings') < html.indexOf('Signed in as'))
    assert(html.includes('class="theme-toggle-input" checked'))
    assert(html.includes('class="theme-switch-track" aria-hidden="true"'))
    var settingsMenu = html.slice(html.indexOf('class="dropdown-menu settings-menu"'))
    assert(settingsMenu.indexOf('Dark Mode') < settingsMenu.indexOf('class="divider"'))
    assert(settingsMenu.indexOf('class="divider"') < settingsMenu.indexOf('href="#accounts"'))
    assert(settingsMenu.indexOf('href="#accounts"') < settingsMenu.indexOf('account-logout'))
  })

  it('hides account controls when authentication is disabled', function () {
    var html = template({ username: null, canManageAccounts: false, canViewAuditLog: false, darkMode: false, isActiveRoute: function () { return '' }, isServersActive: function () { return '' } })
    assert(!html.includes('Signed in as'))
    assert(!html.includes('account-logout'))
    assert(!html.includes('href="#accounts"'))
    assert(!html.includes('href="#audit-log"'))
    assert(html.includes('class="theme-toggle-input"'))
    assert(!html.includes('class="theme-toggle-input" checked'))
    assert(!html.slice(html.indexOf('class="dropdown-menu settings-menu"')).includes('class="divider"'))
  })

  it('shows audit and account management links independently', function () {
    function render (manage, audit) {
      return template({ username: 'operator', canManageAccounts: manage, canViewAuditLog: audit, darkMode: false, isActiveRoute: function () { return '' }, isServersActive: function () { return '' } })
    }
    assert(render(false, true).includes('href="#audit-log"'))
    assert(!render(false, true).includes('href="#accounts"'))
    assert(render(true, false).includes('href="#accounts"'))
    assert(!render(true, false).includes('href="#audit-log"'))
  })

  it('handles the route before history starts and highlights server sections', function () {
    var module = { exports: {} }
    var backbone = { history: {} }
    var dependencies = {
      underscore: require('underscore'),
      jquery: {},
      backbone: backbone,
      marionette: { ItemView: { extend: function (view) { return view } } },
      'backbone.bootstrap-modal': {},
      'app/views/navigation/servers/list': {},
      'tpl/navigation.html': ''
    }
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'navigation.js'), 'utf8')
    vm.runInNewContext(source, {
      module: module,
      window: { armaTheme: { get: function () { return 'dark' } } },
      require: function (name) { return dependencies[name] }
    })
    var helpers = module.exports.templateHelpers()
    assert.strictEqual(helpers.isServersActive(), '')
    backbone.history.fragment = 'servers/one'
    assert.strictEqual(helpers.isServersActive(), 'active')
    backbone.history.fragment = 'mods'
    assert.strictEqual(helpers.isServersActive(), 'active')
    backbone.history.fragment = 'accounts'
    assert.strictEqual(helpers.isServersActive(), '')
  })
})
