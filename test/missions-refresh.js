var assert = require('assert')
var fs = require('fs')
var path = require('path')
var vm = require('vm')

describe('mission refresh', function () {
  it('disables the button while requesting and reports success or failure', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'missions', 'index.js'), 'utf8')
    var module = { exports: {} }
    var request
    var callbacks = {}
    var state = {}
    var dependencies = {
      jquery: {
        ajax: function (options) {
          request = options
          return {
            done: function (fn) { callbacks.success = fn; return this },
            fail: function (fn) { callbacks.failure = fn; return this },
            always: function (fn) { callbacks.complete = fn; return this }
          }
        }
      },
      underscore: require('underscore'),
      marionette: { LayoutView: { extend: function (view) { return view } } },
      'tpl/missions/index.html': ''
    }
    vm.runInNewContext(source, { module: module, require: function (name) { return dependencies[name] } })
    var view = module.exports
    view.$ = function (selector) {
      if (selector === '.refresh-missions') return { prop: function (key, value) { state.disabled = value } }
      if (selector === '.missions-refresh-status') return { text: function (value) { state.status = value } }
    }
    view.refresh()
    assert.strictEqual(request.url, '/api/missions/refresh')
    assert.strictEqual(request.type, 'POST')
    assert.strictEqual(state.disabled, true)
    assert.strictEqual(state.status, 'Requesting mission refresh...')
    callbacks.failure({ responseText: 'Not permitted' })
    assert.strictEqual(state.status, 'Unable to refresh missions: Not permitted')
    callbacks.complete()
    assert.strictEqual(state.disabled, false)
    view.refresh()
    callbacks.success()
    assert.strictEqual(state.status, 'Mission refresh requested.')
    callbacks.complete()
    assert.strictEqual(state.disabled, false)
  })
})
