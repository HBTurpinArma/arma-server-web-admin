var assert = require('assert')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')
var vm = require('vm')

describe('server editor layout', function () {
  function read (file) {
    return fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  }

  it('keeps information tooltips in normal case inside uppercase headings', function () {
    var css = read('public/css/styles.css')
    ;['account-info-trigger', 'account-info-text'].forEach(function (name) {
      var rule = css.match(new RegExp('\\.' + name + '\\s*\\{([^}]*)\\}'))
      assert(rule)
      assert(/text-transform:\s*none\s*;/.test(rule[1]))
      assert(/letter-spacing:\s*normal\s*;/.test(rule[1]))
    })
  })

  it('keeps striped table cells on the themed row background', function () {
    var css = read('public/css/preset-theme.css')
    assert(css.includes('html .table .table'))
    assert(css.includes('html .table-striped > tbody > tr:nth-of-type(odd) > td'))
    assert(css.includes('html[data-theme="dark"] .table-striped > tbody > tr:nth-of-type(odd) > td'))
    assert(css.includes('background: var(--app-row);'))
  })

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
    ;['toggle-server-only', 'include-server-only', 'check-include-server-only',
      'toggle-required', 'toggle-optional', 'include-required', 'include-optional', 'check-include-required',
      'check-include-optional', 'preset-battalion', 'preset-am2035', 'reforger-mods'].forEach(function (name) {
      assert(mods.includes(name))
    })
    assert(/<tbody\s*>/i.test(mods))
    assert(mods.includes('cc cc-arma3'))
    assert(mods.includes('cc cc-reforger'))
    assert(mods.includes('<label for="include-required">Required</label>'))
    assert(mods.includes('<label for="include-optional">Optional</label>'))
    assert(mods.includes('aria-labelledby="server-mods-controls-heading"'))
    assert(mods.includes('aria-labelledby="server-mods-presets-heading"'))
    assert(mods.includes('class="col-md-8"'))
    assert(mods.includes('class="col-md-4"'))
    assert.strictEqual((mods.match(/class="server-mods-filter-controls"/g) || []).length, 3)
    assert(mods.includes('aria-labelledby="server-mods-heading"'))
    assert(mods.indexOf('preset-battalion') < mods.indexOf('aria-labelledby="server-mods-heading"'))
    ;['selection', 'presets'].forEach(function (name) {
      assert(mods.includes('aria-describedby="server-mods-' + name + '-help"'))
      assert(mods.includes('role="tooltip" id="server-mods-' + name + '-help"'))
    })
    assert(mods.includes('value="am2\\" placeholder="am2\\" id="include-required"'))
    assert(mods.includes('value="clientside\\" placeholder="clientside\\" id="include-optional"'))
    assert(mods.includes('value="serverside\\" placeholder="serverside\\" id="include-server-only"'))
    assert(mods.includes('An empty path matches all mods'))
    assert.strictEqual((mods.match(/class="account-info-trigger"/g) || []).length, 2)
    assert(mods.includes('class="btn btn-primary check-include-required"'))
    assert(mods.includes('class="btn btn-primary check-include-optional"'))
    assert(mods.includes('class="btn btn-default preset-battalion"'))
    assert(!mods.includes('btn-xs'))
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

  it('dismisses mod information on Escape and restores it when focus leaves', function () {
    var module = { exports: {} }
    var dismissed = false
    var target = {}
    var wrapper = {
      closest: function () { return this },
      addClass: function (name) { if (name === 'info-dismissed') dismissed = true },
      removeClass: function (name) { if (name === 'info-dismissed') dismissed = false }
    }
    var dependencies = {
      jquery: function () { return wrapper },
      underscore: underscore,
      'app/views/mods/list': { extend: function (view) { return view } },
      'app/views/servers/mods/list_item': {},
      'tpl/servers/mods/list.html': ''
    }
    vm.runInNewContext(read('public/js/app/views/servers/mods/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.dismissInfo({ key: 'a', currentTarget: target })
    assert.strictEqual(dismissed, false)
    view.dismissInfo({ key: 'Escape', currentTarget: target })
    assert.strictEqual(dismissed, true)
    view.resetInfo({ currentTarget: target })
    assert.strictEqual(dismissed, false)
  })

  it('selects and toggles server-only mods without changing other selections', function () {
    var module = { exports: {} }
    var boxes = [
      { value: 'serverside\\one', checked: false },
      { value: 'clientside\\two', checked: true },
      { value: 'serverside\\three', checked: false }
    ]
    var required = [{ value: 'serverside\\one', checked: true }]
    var filter = 'serverside\\'
    var dependencies = {
      jquery: function (element) {
        return {
          val: function () { return element.value },
          prop: function (name, value) { element[name] = value; return this }
        }
      },
      underscore: underscore,
      'app/views/mods/list': { extend: function (view) { return view } },
      'app/views/servers/mods/list_item': {},
      'tpl/servers/mods/list.html': ''
    }
    vm.runInNewContext(read('public/js/app/views/servers/mods/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.$ = function (selector) {
      if (selector === '#include-server-only') return { val: function () { return filter } }
      assert.strictEqual(selector, 'input[name=server_only]:checkbox')
      return {
        0: boxes[0],
        length: boxes.length,
        map: function (callback) {
          return boxes.map(function (box, index) { return callback(index, box) })
        }
      }
    }
    var prevented = 0
    var event = { preventDefault: function () { prevented++ } }
    view.checkIncludeServerOnly(event)
    assert.deepStrictEqual(boxes.map(function (box) { return box.checked }), [true, false, true])
    assert.strictEqual(required[0].checked, true)
    view.toggleServerOnly(event)
    assert.deepStrictEqual(boxes.map(function (box) { return box.checked }), [false, false, false])
    view.toggleServerOnly(event)
    assert.deepStrictEqual(boxes.map(function (box) { return box.checked }), [true, true, true])
    filter = 'clientside\\'
    view.checkOnEnterServerOnly({ which: 13, preventDefault: event.preventDefault })
    assert.deepStrictEqual(boxes.map(function (box) { return box.checked }), [false, true, false])
    view.checkOnEnterServerOnly({ which: 65, preventDefault: event.preventDefault })
    assert.strictEqual(prevented, 4)
    boxes.length = 0
    view.toggleServerOnly(event)
  })

  it('applies AM2 and AM2035 presets with the specified required DLCs', function () {
    var module = { exports: {} }
    var names = ['am2\\@first', 'am2\\optionals\\@excluded', 'am2035\\@second',
      'am2035\\optionals\\@excluded', 'ws', 'rf', 'ef', 'news', 'other\\ws',
      'clientside\\@client', 'serverside\\@server']
    var boxes = {}
    ;['required', 'optional', 'server_only'].forEach(function (group) {
      boxes[group] = names.map(function (name) { return { value: name, checked: true } })
    })
    var dependencies = {
      jquery: function (element) {
        return {
          val: function () { return element.value },
          prop: function (name, value) { element[name] = value; return this }
        }
      },
      underscore: underscore,
      'app/views/mods/list': { extend: function (view) { return view } },
      'app/views/servers/mods/list_item': {},
      'tpl/servers/mods/list.html': ''
    }
    vm.runInNewContext(read('public/js/app/views/servers/mods/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.$ = function (selector) {
      var match = selector.match(/^input\[name=(required|optional|server_only)\]:checkbox$/)
      assert(match, selector)
      return {
        map: function (callback) {
          return boxes[match[1]].map(function (item, index) { return callback(index, item) })
        }
      }
    }
    function selected (group) {
      return boxes[group].filter(function (box) { return box.checked }).map(function (box) { return box.value })
    }
    assert.strictEqual(view.events['click .preset-battalion'], 'setPresetAM2')
    assert.strictEqual(view.events['click .preset-am2035'], 'setPresetAM2035')
    var prevented = 0
    var event = { preventDefault: function () { prevented++ } }
    view.setPresetAM2(event)
    assert.deepStrictEqual(selected('required'), ['am2\\@first', 'ws'])
    assert.deepStrictEqual(selected('optional'), ['clientside\\@client'])
    assert.deepStrictEqual(selected('server_only'), ['serverside\\@server'])
    view.setPresetAM2035(event)
    assert.deepStrictEqual(selected('required'), ['am2035\\@second', 'ws', 'rf', 'ef'])
    assert.deepStrictEqual(selected('optional'), ['clientside\\@client'])
    assert.deepStrictEqual(selected('server_only'), ['serverside\\@server'])
    assert.strictEqual(prevented, 2)
  })
})
