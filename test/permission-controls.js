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

  it('fails closed until permissions are loaded and after a request fails', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'permissions.js'), 'utf8')
    var module = { exports: {} }
    var model = {
      values: {},
      get: function (name) { return this.values[name] },
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
    assert.strictEqual(model.can('servers', 'edit'), true)
    model.refresh()
    assert.strictEqual(model.can('servers', 'edit'), false)
    model.values.permissions = { servers: { edit: true } }
    model.error(model, { status: 500 })
    assert.strictEqual(model.can('servers', 'edit'), false)
  })
})
