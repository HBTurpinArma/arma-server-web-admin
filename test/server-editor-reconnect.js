var assert = require('assert')
var Backbone = require('backbone')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')
var vm = require('vm')

function loadView (file, dependencies) {
  var module = { exports: {} }
  var source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  vm.runInNewContext(source, {
    module: module,
    require: function (name) {
      return Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : {}
    }
  })
  return module.exports
}

describe('server editor reconnects and saves', function () {
  it('does not update a nested permission view destroyed during a permission event', function () {
    var permissions = new Backbone.Model()
    permissions.can = function () { return true }
    var definition = loadView('public/js/app/views/permission-page.js', {
      underscore: underscore,
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'app/permissions': permissions
    })
    var shows = 0
    var nested = {
      isRendered: true,
      isDestroyed: false,
      allowed: false,
      group: 'mods',
      createView: function () { return {} },
      content: { show: function () { shows++ } }
    }

    definition.updateContent.call(nested)
    assert.strictEqual(shows, 1)
    nested.allowed = false
    permissions.on('change:permissionsStatus', function () {
      nested.isDestroyed = true
      permissions.off('change:permissionsStatus', definition.updateContent, nested)
    })
    permissions.on('change:permissionsStatus', definition.updateContent, nested)
    permissions.set('permissionsStatus', 'loading')
    assert.strictEqual(shows, 1)
  })

  it('ignores a successful save after the editor is destroyed and reports network failures', function () {
    var options
    var alert
    var navigated = 0
    var definition = loadView('public/js/app/views/servers/view.js', {
      underscore: underscore,
      backbone: { history: { navigate: function () { navigated++ } } },
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'sweet-alert': function (message) { alert = message },
      'app/permissions': { can: function (group, action) { return action === 'edit' } },
      'tpl/servers/view.html': ''
    })
    var id = 'old'
    var updates = 0
    var view = {
      model: {
        get: function () { return id },
        save: function (data, saveOptions) { options = saveOptions }
      },
      settingsView: { currentView: { serialize: function () { return { title: 'server' } } } },
      parametersView: { currentView: { serialize: function () { return {} } } },
      serverUpdated: function () { updates++ }
    }

    definition.save.call(view)
    options.success()
    assert.strictEqual(updates, 1)
    id = 'new'
    options.success()
    assert.strictEqual(navigated, 1)
    view.isDestroyed = true
    options.success()
    assert.strictEqual(navigated, 1)
    assert.strictEqual(updates, 1)
    options.error(view.model, { responseText: '' })
    assert(alert.text.includes('Check your connection'))
    options.error(view.model, { responseText: 'Server rejected the update' })
    assert.strictEqual(alert.text, 'Server rejected the update')
  })
})
