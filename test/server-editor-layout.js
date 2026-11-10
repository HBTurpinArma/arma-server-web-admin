var assert = require('assert')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')
var vm = require('vm')

describe('server editor layout', function () {
  function read (file) {
    return fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  }

  it('keeps the editor regions and permission-aware save control', function () {
    var template = underscore.template(read('public/js/tpl/servers/view.html'))
    var html = template({ title: '<Test>', canEdit: false })
    assert(html.includes('&lt;Test&gt;'))
    assert(html.includes('disabled title="Requires Servers Edit permission"'))
    ;['tab-info', 'tab-mods', 'tab-missions', 'tab-settings', 'tab-players', 'settings', 'parameters'].forEach(function (id) {
      assert(html.includes('id="' + id + '"'))
    })
    assert(!template({ title: 'Test', canEdit: true }).includes('Requires Servers Edit permission'))
    var view = read('public/js/app/views/servers/view.js')
    assert(view.includes("if ($(e.target).is('.server-save-form')) this.save()"))
    assert(view.includes("this.$('.server-save-form button[type=submit]')"))
  })

  it('preserves mod controls and mission regions in themed sections', function () {
    var mods = read('public/js/tpl/servers/mods/list.html')
    ;['toggle-required', 'toggle-optional', 'include-required', 'include-optional', 'check-include-required',
      'check-include-optional', 'preset-battalion', 'preset-ww2', 'reforger-mods'].forEach(function (name) {
      assert(mods.includes(name))
    })
    assert(/<tbody\s*>/i.test(mods))
    assert(mods.includes('cc cc-arma3'))
    assert(mods.includes('cc cc-reforger'))
    var missions = read('public/js/tpl/servers/missions/index.html')
    assert(missions.includes('id="available"'))
    assert(missions.includes('id="rotation"'))
    assert(missions.includes('id="filterMissions"'))
  })

  it('does not replace inaccessible mission and mod selections when saving', function () {
    var module = { exports: {} }
    var canView = false
    var saved
    var dependencies = {
      jquery: {},
      underscore: underscore,
      backbone: {},
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'sweet-alert': function () {},
      'app/permissions': {
        can: function (group, action) { return action === 'edit' || canView }
      },
      'tpl/servers/view.html': ''
    }
    vm.runInNewContext(read('public/js/app/views/servers/view.js'), {
      module: module,
      require: function (name) {
        return Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : {}
      }
    })
    var view = module.exports
    view.model = {
      get: function () { return 'id' },
      save: function (data) { saved = data }
    }
    view.settingsView = { currentView: { serialize: function () { return { title: 'server' } } } }
    view.parametersView = { currentView: { serialize: function () { return {} } } }
    view.missionsView = { currentView: { content: { currentView: { serialize: function () { return { missions: ['changed'] } } } } } }
    view.modsView = { currentView: { content: { currentView: { serialize: function () { return { mods: ['changed'] } } } } } }
    view.save()
    assert.strictEqual(saved.missions, undefined)
    assert.strictEqual(saved.mods, undefined)
    canView = true
    view.save()
    assert.deepStrictEqual(saved.missions, ['changed'])
    assert.deepStrictEqual(saved.mods, ['changed'])
  })
})
