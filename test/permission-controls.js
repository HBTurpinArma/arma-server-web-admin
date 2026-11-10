var assert = require('assert')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')
var vm = require('vm')

describe('permission-aware controls', function () {
  function template (name) {
    return underscore.template(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', name), 'utf8'))
  }

  it('renders the server Save button disabled until permission is granted', function () {
    var render = template('servers/view.html')
    assert(/type="submit" disabled title="Requires Servers Edit permission"/.test(render({ title: 'server', canEdit: false })))
    assert(!/type="submit" disabled/.test(render({ title: 'server', canEdit: true })))
  })

  it('renders mission, log and server delete buttons enabled only with permission', function () {
    var cases = [
      { file: 'missions/list_item.html', data: { game: 'arma3', name: 'mission', missionName: 'm', worldName: 'w', sizeFormatted: '1', dateModified: '2026-01-01' }, label: 'Missions' },
      { file: 'logs/list_item.html', data: { name: 'log', size: 1, formattedSize: '1', created: '2026-01-01', modified: '2026-01-01' }, label: 'Logs' },
      { file: 'servers/list_item.html', data: { pid: null, state: null, id: 'id', title: 'server', port: 1, processes: [], virtual_server: false, game_selected: 'arma3' }, label: 'Servers' }
    ]
    cases.forEach(function (item) {
      var render = template(item.file)
      item.data.canDelete = false
      assert(render(item.data).includes('disabled title="Requires ' + item.label + ' Delete permission"'))
      item.data.canDelete = true
      assert(!render(item.data).includes('Requires ' + item.label + ' Delete permission'))
    })
  })

  it('renders log access and loading errors without exposing the table', function () {
    var render = template('logs/list.html')
    var denied = render({ canView: false, permissionsStatus: 'ready' })
    assert(denied.includes('You do not have permission to view logs.'))
    assert(!denied.includes('id="rpt-list"'))
    assert(!denied.includes('id="log-list"'))
    assert(render({ canView: false, permissionsStatus: 'loading' }).includes('Checking log view permission'))
    assert(render({ canView: false, permissionsStatus: 'error' }).includes('Unable to check log view permission'))
    var allowed = render({ canView: true, permissionsStatus: 'ready' })
    assert(!allowed.includes('You do not have permission'))
    assert(allowed.includes('id="rpt-list"'))
    assert(allowed.includes('id="log-list"'))
  })

  it('renders appropriate access messages for each protected page', function () {
    var render = template('permission-page.html')
    ;['servers', 'missions', 'mods'].forEach(function (group) {
      var title = group.charAt(0).toUpperCase() + group.slice(1)
      assert(render({ group: group, title: title, status: 'ready' }).includes('You do not have permission to view ' + group))
      assert(render({ group: group, title: title, status: 'loading' }).includes('Checking ' + group + ' view permission'))
      assert(render({ group: group, title: title, status: 'error' }).includes('Unable to check ' + group + ' view permission'))
    })
  })

  it('replaces restricted content when view permission changes', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'permission-page.js'), 'utf8')
    var module = { exports: {} }
    var allowed = false
    var shown
    var creates = 0
    var dependencies = {
      underscore: underscore,
      marionette: {
        LayoutView: { extend: function (view) { return view } },
        ItemView: function (options) { this.options = options }
      },
      'app/permissions': { can: function () { return allowed }, get: function () { return 'ready' } },
      'tpl/permission-page.html': ''
    }
    vm.runInNewContext(source, { module: module, require: function (name) { return dependencies[name] } })
    var view = module.exports
    view.isRendered = true
    view.group = 'missions'
    view.title = 'Missions'
    view.content = { show: function (item) { shown = item } }
    view.createView = function () { creates++; return 'content' }
    view.updateContent()
    assert.strictEqual(shown.options.templateHelpers.group, 'missions')
    assert.strictEqual(creates, 0)
    allowed = true
    view.updateContent()
    assert.strictEqual(shown, 'content')
    view.updateContent()
    assert.strictEqual(creates, 1)
    allowed = false
    view.updateContent()
    assert.strictEqual(shown.options.templateHelpers.group, 'missions')
  })

  it('updates mission upload availability and blocks unauthorized submissions', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'missions', 'upload.js'), 'utf8')
    var module = { exports: {} }
    var allowed = false
    var status = 'ready'
    var disabled
    var message
    var permissions = { can: function () { return allowed }, get: function () { return status } }
    var dependencies = {
      jquery: {},
      underscore: underscore,
      marionette: { ItemView: { extend: function (view) { return view } } },
      ladda: {},
      'app/permissions': permissions,
      'tpl/missions/upload.html': ''
    }
    vm.runInNewContext(source, { module: module, require: function (name) { return dependencies[name] } })
    var view = module.exports
    view.$ = function (selector) {
      if (selector === 'button[type=submit]') {
        return {
          prop: function (name, value) { disabled = value; return this },
          attr: function () { return this }
        }
      }
      return { text: function (value) { message = value } }
    }
    view.updatePermission()
    assert.strictEqual(disabled, true)
    assert(message.includes('Missions Create'))
    view.submit({ preventDefault: function () {} })
    allowed = true
    view.updatePermission()
    assert.strictEqual(disabled, false)
    view.uploading = true
    view.updatePermission()
    assert.strictEqual(disabled, true)
    status = 'error'
    allowed = false
    view.updatePermission()
    assert(message.includes('Unable to check'))
  })

  it('fails closed until permissions are loaded and after a request fails', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'permissions.js'), 'utf8')
    var module = { exports: {} }
    var model = {
      values: {},
      get: function (name) { return this.values[name] },
      set: function (name, value) { this.values[name] = value },
      unset: function (name) { delete this.values[name] },
      clear: function () { this.values = {} },
      fetch: function (options) { this.error = options.error }
    }
    vm.runInNewContext(source, {
      module: module,
      require: function () { return { Model: function () { return model } } },
      console: { error: function () {} }
    })
    assert.strictEqual(model.can('servers', 'edit'), false)
    model.values.permissions = { servers: { edit: true } }
    model.values.permissionsStatus = 'ready'
    assert.strictEqual(model.can('servers', 'edit'), true)
    model.refresh()
    assert.strictEqual(model.can('servers', 'edit'), false)
    assert.strictEqual(model.get('permissionsStatus'), 'loading')
    model.values.permissions = { servers: { edit: true } }
    model.error(model, { status: 500 })
    assert.strictEqual(model.can('servers', 'edit'), false)
    assert.strictEqual(model.get('permissionsStatus'), 'error')
  })

  it('removes protected child listeners before permission refresh emits a general change', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'permissions.js'), 'utf8')
    var Backbone = require('backbone')
    var module = { exports: {} }
    vm.runInNewContext(source, {
      module: module,
      require: function () { return Backbone },
      console: console
    })
    var model = module.exports
    var childChanges = 0
    model.set({ permissionsStatus: 'ready', permissions: { missions: { view: true } } })
    function childChange () { childChanges++ }
    model.on('change', childChange)
    model.on('change:permissionsStatus', function (changed, status) {
      if (status === 'loading') model.off('change', childChange)
    })
    model.fetch = function () { return { readyState: 4 } }
    model.refresh()
    assert.strictEqual(childChanges, 0)
    assert.strictEqual(model.can('missions', 'view'), false)
  })
})
