var assert = require('assert')
var fs = require('fs')
var path = require('path')
var vm = require('vm')

describe('browser theme preference', function () {
  function load (saved, unavailable) {
    var listeners = {}
    var attributes = {}
    var messages = []
    var storage = {
      getItem: function () {
        if (unavailable) throw new Error('storage unavailable')
        return saved
      },
      setItem: function (key, value) {
        if (unavailable) throw new Error('storage unavailable')
        saved = value
      }
    }
    var window = {
      localStorage: storage,
      Event: function (type) { this.type = type },
      addEventListener: function (type, callback) { listeners[type] = callback },
      dispatchEvent: function (event) { if (listeners[event.type]) listeners[event.type](event) }
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'theme.js'), 'utf8'), {
      window: window,
      document: { documentElement: { setAttribute: function (key, value) { attributes[key] = value } } },
      console: { error: function (message) { messages.push(message) } }
    })
    return { window: window, attributes: attributes, listeners: listeners, messages: messages, saved: function () { return saved } }
  }

  it('defaults to dark and persists a light or dark choice', function () {
    var context = load(null)
    assert.strictEqual(context.attributes['data-theme'], 'dark')
    assert.strictEqual(context.window.armaTheme.set('light'), true)
    assert.strictEqual(context.saved(), 'light')
    assert.strictEqual(context.attributes['data-theme'], 'light')
    assert.strictEqual(load(context.saved()).window.armaTheme.get(), 'light')
    assert.strictEqual(context.window.armaTheme.set('dark'), true)
    assert.strictEqual(load(context.saved()).window.armaTheme.get(), 'dark')
  })

  it('updates when another tab changes or clears the preference', function () {
    var context = load('dark')
    context.listeners.storage({ key: 'arma-admin-theme', newValue: 'light' })
    assert.strictEqual(context.window.armaTheme.get(), 'light')
    context.listeners.storage({ key: null, newValue: null })
    assert.strictEqual(context.window.armaTheme.get(), 'dark')
  })

  it('reports storage failures and keeps the current theme on save failure', function () {
    var context = load(null, true)
    assert.strictEqual(context.window.armaTheme.get(), 'dark')
    assert.strictEqual(context.window.armaTheme.set('light'), false)
    assert.strictEqual(context.attributes['data-theme'], 'dark')
    assert.strictEqual(context.messages.length, 2)
    assert.throws(function () { context.window.armaTheme.set('invalid') }, /Invalid theme/)
  })
})
