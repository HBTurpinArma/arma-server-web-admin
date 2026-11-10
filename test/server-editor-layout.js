var assert = require('assert')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')

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
})
