var assert = require('assert')
var Backbone = require('backbone')
var fs = require('fs')
var path = require('path')
var underscore = require('underscore')
var vm = require('vm')

function read (name) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'js', name), 'utf8')
}

describe('log file sections', function () {
  it('renders three titled sections with responsive list containers', function () {
    var render = underscore.template(read('tpl/logs/list.html'))
    var html = render({ canView: true, permissionsStatus: 'ready' })
    assert(html.includes('aria-labelledby="rpt-logs-heading"'))
    assert(html.includes('RPT Files (.rpt)'))
    assert(html.includes('aria-labelledby="log-files-heading"'))
    assert(html.includes('Log Files (.log)'))
    assert(html.includes('aria-labelledby="taw-logs-heading"'))
    assert(html.includes('TAW Logging (.log, .json)'))
    assert.strictEqual((html.match(/class="panel-heading mods-section-heading"/g) || []).length, 3)
    assert.strictEqual((html.match(/class="btn btn-default btn-xs refresh-logs"/g) || []).length, 3)
    assert(html.includes('<div class="table-responsive logs-table-scroll"><div id="rpt-list"></div></div>'))
    assert(html.includes('<div class="table-responsive logs-table-scroll"><div id="log-list"></div></div>'))
    assert(html.includes('<div class="table-responsive logs-table-scroll"><div id="taw-log-list"></div></div>'))
    assert(html.includes('<div class="logs-primary-grid">'))
    var denied = render({ canView: false, permissionsStatus: 'ready' })
    assert(!denied.includes('refresh-logs'))
    var table = read('tpl/logs/file_list.html')
    assert(table.includes('<tbody></tbody>'))
    ;['Filename', 'Modified', 'Size'].forEach(function (heading) {
      assert(table.includes(heading))
    })
    assert(!table.includes('Created'))
    var pairedRow = underscore.template(read('tpl/logs/list_item.html'))({
      name: 'event',
      source: 'taw',
      files: [{ name: 'event.log', size: 10 }, { name: 'event.json', size: 20 }],
      missionName: 'operation_test',
      playerCount: 12,
      modified: '2026-01-01',
      formattedSize: '30 B',
      canDelete: true
    })
    assert(pairedRow.includes('/api/logs/taw/event.json/leaderboard'))
    assert(pairedRow.includes('download="event-leaderboard.png"'))
    assert(pairedRow.includes('Leaderboard'))
    assert(pairedRow.includes('operation_test'))
    assert(pairedRow.includes('12 players'))
    assert(!pairedRow.includes('/api/logs/taw/event.json/download'))
    assert(!pairedRow.includes('/api/logs/taw/event.log/download'))
    var primaryRow = underscore.template(read('tpl/logs/list_item.html'))({
      name: 'server.rpt',
      source: 'primary',
      size: 10,
      modified: '2026-01-01',
      formattedSize: '10 B',
      canDelete: true
    })
    assert(!primaryRow.includes('/download'))
  })

  it('filters the shared collection by extension and source and reflects additions and removals', function () {
    var module = { exports: {} }
    var dependencies = {
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/logs/list_item': {},
      'tpl/logs/file_list.html': ''
    }
    vm.runInNewContext(read('app/views/logs/file_list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    var logs = new Backbone.Collection([
      { name: 'first.rpt', source: 'primary' },
      { name: 'second.log', source: 'primary' },
      { name: 'event', source: 'taw', files: [{ name: 'event.json' }, { name: 'event.log' }] },
      { name: 'taw', source: 'taw', files: [{ name: 'taw.log' }] },
      { name: 'other.txt', source: 'primary' }
    ])
    var rpt = { extensions: ['.rpt'], source: 'primary' }
    var log = { extensions: ['.log'], source: 'primary' }
    var taw = { extensions: ['.log', '.json'], source: 'taw' }
    function names (context) {
      return logs.filter(function (model) { return view.filter.call(context, model) })
        .map(function (model) { return model.get('name') })
    }
    assert.deepStrictEqual(names(rpt), ['first.rpt'])
    assert.deepStrictEqual(names(log), ['second.log'])
    assert.deepStrictEqual(names(taw), ['event', 'taw'])
    logs.add({ name: 'third.rpt', source: 'primary' })
    logs.remove(logs.at(1))
    assert.deepStrictEqual(names(rpt), ['first.rpt', 'third.rpt'])
    assert.deepStrictEqual(names(log), [])
    assert.deepStrictEqual(names(taw), ['event', 'taw'])
  })

  it('only creates the three filtered lists when viewing is permitted', function () {
    var module = { exports: {} }
    var allowed = false
    var shown = {}
    var collection = new Backbone.Collection()
    function FileListView (options) { this.options = options }
    var dependencies = {
      underscore: underscore,
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'app/permissions': { can: function () { return allowed }, get: function () { return 'ready' } },
      'app/views/logs/file_list': FileListView,
      'tpl/logs/list.html': ''
    }
    vm.runInNewContext(read('app/views/logs/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.listenTo = function (model, event, callback) {
      assert.strictEqual(model, dependencies['app/permissions'])
      assert.strictEqual(event, 'change:permissionsStatus')
      assert.strictEqual(callback, view.render)
    }
    view.initialize()
    view.collection = collection
    view.$ = function () {
      return { prop: function () {}, text: function () {} }
    }
    view.rptList = { show: function (child) { shown.rpt = child } }
    view.logList = { show: function (child) { shown.log = child } }
    view.tawLogList = { show: function (child) { shown.taw = child } }
    view.onRender()
    assert.deepStrictEqual(shown, {})
    allowed = true
    view.onRender()
    assert.strictEqual(shown.rpt.options.collection, collection)
    assert.strictEqual(shown.log.options.collection, collection)
    assert.strictEqual(shown.rpt.options.extension, '.rpt')
    assert.strictEqual(shown.rpt.options.source, 'primary')
    assert.strictEqual(shown.log.options.extension, '.log')
    assert.strictEqual(shown.log.options.source, 'primary')
    assert.strictEqual(shown.taw.options.extensions.join(','), '.log,.json')
    assert.strictEqual(shown.taw.options.source, 'taw')
  })

  it('refreshes both lists together and reports failures and success', function () {
    var module = { exports: {} }
    var allowed = true
    var state = {}
    var options
    var requests = 0
    var dependencies = {
      underscore: underscore,
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'app/permissions': { can: function () { return allowed } },
      'app/views/logs/file_list': function () {},
      'tpl/logs/list.html': ''
    }
    vm.runInNewContext(read('app/views/logs/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.refreshing = false
    view.$ = function (selector) {
      if (selector === '.refresh-logs') return { prop: function (key, value) { state.disabled = value } }
      if (selector === '.logs-refresh-status') return { text: function (value) { state.status = value } }
    }
    view.collection = {
      fetch: function (requestOptions) {
        requests++
        options = requestOptions
      }
    }
    assert.strictEqual(view.events['click .refresh-logs'], 'refresh')
    view.refresh()
    assert.strictEqual(requests, 1)
    assert.strictEqual(state.disabled, true)
    assert.strictEqual(state.status, 'Refreshing log files...')
    view.refresh()
    assert.strictEqual(requests, 1)
    options.error(view.collection, { responseText: 'Not permitted' })
    assert.strictEqual(state.disabled, false)
    assert.strictEqual(state.status, 'Unable to refresh log files: Not permitted')
    view.refresh()
    options.success(view.collection)
    assert.strictEqual(state.disabled, false)
    assert.strictEqual(state.status, 'Log files refreshed.')
    allowed = false
    view.refresh()
    assert.strictEqual(requests, 2)
  })

  it('updates, adds and removes entries in the shared collection on refresh', function () {
    var module = { exports: {} }
    var dependencies = {
      underscore: underscore,
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'app/permissions': { can: function () { return true } },
      'app/views/logs/file_list': function () {},
      'tpl/logs/list.html': ''
    }
    vm.runInNewContext(read('app/views/logs/list.js'), {
      module: module,
      require: function (name) { return dependencies[name] }
    })
    var Log = Backbone.Model.extend({ idAttribute: 'name' })
    var collection = new Backbone.Collection([
      { name: 'kept.rpt', size: 1 },
      { name: 'removed.log', size: 1 }
    ], { model: Log })
    collection.sync = function (method, model, options) {
      assert.strictEqual(method, 'read')
      options.success([{ name: 'kept.rpt', size: 2 }, { name: 'new.log', size: 3 }])
    }
    var view = module.exports
    view.collection = collection
    view.refreshing = false
    view.$ = function () { return { prop: function () {}, text: function () {} } }
    view.refresh()
    assert.strictEqual(collection.length, 2)
    assert.strictEqual(collection.get('kept.rpt').get('size'), 2)
    assert.strictEqual(collection.get('new.log').get('size'), 3)
    assert.strictEqual(collection.get('removed.log'), undefined)
    assert.strictEqual(view.refreshStatus, 'Log files refreshed.')
  })
})
