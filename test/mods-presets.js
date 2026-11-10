var assert = require('assert')
var express = require('express')
var fs = require('fs')
var os = require('os')
var path = require('path')
var request = require('supertest')
var underscore = require('underscore')
var vm = require('vm')

describe('launcher presets on the Mods page', function () {
  it('renders two matching sections with separate refresh controls', function () {
    var html = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'mods', 'list.html'), 'utf8')
    assert(/<h2 class="panel-title" id="launcher-presets-heading">Loaded Presets<\/h2>/.test(html))
    assert(/<h2 class="panel-title">Installed Mods<\/h2>/.test(html))
    assert(html.includes('col-sm-4 mods-overview-actions'))
    assert(html.includes('col-sm-8 mods-overview-presets'))
    assert(html.includes('aria-labelledby="upload-preset-heading"'))
    assert(html.includes('aria-labelledby="launcher-presets-heading"'))
    assert(html.includes('class="btn btn-default btn-xs refresh-presets"'))
    assert(html.includes('class="btn btn-default btn-xs refresh-mods"'))
  })

  it('groups the mission filter and list in a titled section', function () {
    var html = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'missions', 'index.html'), 'utf8')
    assert(html.includes('<section class="panel panel-default" aria-labelledby="mission-list-heading">'))
    assert(html.includes('<h2 class="panel-title" id="mission-list-heading">Missions</h2>'))
    assert(html.includes('id="filterMissions"'))
    assert(html.includes('<div class="table-responsive"><div id="list"></div></div>'))
    assert(html.includes('class="btn btn-default btn-xs refresh-missions"'))
    assert(!html.includes('Refresh missions list'))
  })

  it('refreshes each list independently and reports mod refresh failures', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'mods', 'list.js'), 'utf8')
    var module = { exports: {} }
    var request
    var callbacks = {}
    var presetRefreshed = false
    var state = { presetsDisabled: false, modsDisabled: false, presetsStatus: '', modsStatus: '' }
    var jquery = {
      ajax: function (options) {
        request = options
        return {
          done: function (fn) { callbacks.success = fn; return this },
          fail: function (fn) { callbacks.failure = fn; return this },
          always: function (fn) { callbacks.complete = fn; return this }
        }
      }
    }
    var dependencies = {
      jquery: jquery,
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/mods/list_item': {},
      'tpl/mods/list.html': ''
    }
    vm.runInNewContext(source, { module: module, require: function (name) { return dependencies[name] } })
    var view = module.exports
    view.$ = function (selector) {
      if (selector === '.refresh-presets') return { prop: function (name, value) { state.presetsDisabled = value } }
      if (selector === '.refresh-mods') return { prop: function (name, value) { state.modsDisabled = value } }
      if (selector === '.presets-status') return { text: function (value) { state.presetsStatus = value } }
      if (selector === '.mods-refresh-status') return { text: function (value) { state.modsStatus = value } }
    }
    view.loadPresets = function () {
      presetRefreshed = true
      return { always: function (fn) { callbacks.presetComplete = fn } }
    }
    view.refreshPresets()
    assert(presetRefreshed)
    assert.strictEqual(request, undefined)
    assert.strictEqual(state.presetsDisabled, true)
    assert.strictEqual(state.presetsStatus, 'Loading presets...')
    callbacks.presetComplete()
    assert.strictEqual(state.presetsDisabled, false)
    view.refreshMods()
    assert.strictEqual(request.url, '/api/mods/refresh')
    assert.strictEqual(request.type, 'POST')
    assert.strictEqual(state.modsDisabled, true)
    callbacks.failure({ responseText: 'Not permitted' })
    assert.strictEqual(state.modsStatus, 'Unable to refresh mods: Not permitted')
    callbacks.complete()
    assert.strictEqual(state.modsDisabled, false)
    view.refreshMods()
    callbacks.success()
    assert.strictEqual(state.modsStatus, 'Mod refresh requested.')
    callbacks.complete()
  })

  it('keeps the server mod list child container compatible with its own template', function () {
    var module = { exports: {} }
    var parent = { extend: function (view) { return view } }
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'servers', 'mods', 'list.js'), 'utf8')
    var serverTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'servers', 'mods', 'list.html'), 'utf8')
    var mainTemplate = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tpl', 'mods', 'list.html'), 'utf8')
    vm.runInNewContext(source, {
      module: module,
      require: function (name) {
        if (name === 'app/views/mods/list') return parent
        if (name === 'underscore') return underscore
        if (name === 'tpl/servers/mods/list.html') return serverTemplate
        return {}
      }
    })
    assert.strictEqual(module.exports.childViewContainer, 'tbody')
    assert(/<tbody\s*>/i.test(serverTemplate))
    assert(/<tbody[^>]*class="[^"]*\bmods-list\b/i.test(mainTemplate))
  })

  it('lists only launcher HTML files from the configured directory', async function () {
    var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-presets-test-'))
    var html = path.join(directory, 'Preset B.HTML')
    var other = path.join(directory, 'ignored.txt')
    var subdir = path.join(directory, 'folder.html')
    try {
      fs.writeFileSync(html, 'example')
      fs.writeFileSync(other, 'not a preset')
      fs.mkdirSync(subdir)
      var app = express()
      app.use('/api/presets', require('../routes/presets')(directory))
      var response = await request(app).get('/api/presets').expect(200)
      assert.deepStrictEqual(response.body, ['Preset B.HTML'])
    } finally {
      fs.unlinkSync(html)
      fs.unlinkSync(other)
      fs.rmdirSync(subdir)
      fs.rmdirSync(directory)
    }
  })

  it('shows filenames as text and handles empty, disabled, and failed requests', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'mods', 'list.js'), 'utf8')
    var module = { exports: {} }
    var callbacks = {}
    var state = { items: [], links: [], status: '', uploadDisabled: true, availability: '', deleteDisabled: null }
    var jquery = function (tag, attributes) {
      var item = {}
      if (tag === '<a>') state.links.push(attributes)
      return {
        text: function (name) { item.text = name; return this },
        append: function (child) { if (!item.child) item.child = child; return this },
        appendTo: function (target) { if (tag === '<tr>') state.items.push(item.child.value); return this },
        attr: function () { return this },
        prop: function (name, value) { if (tag === '<button>' && name === 'disabled') state.deleteDisabled = value; return this },
        data: function () { return this },
        get value () { return item.text || (item.child && item.child.value) }
      }
    }
    jquery.getJSON = function (url) {
      return {
        done: function (callback) {
          callbacks[url] = { success: callback }
          return { fail: function (callback) { callbacks[url].failure = callback } }
        }
      }
    }
    var dependencies = {
      jquery: jquery,
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/mods/list_item': {},
      'tpl/mods/list.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      clearTimeout: clearTimeout,
      document: { createTextNode: function (text) { return text } },
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.$ = function (selector) {
      if (selector === '.presets-list') return { empty: function () { state.items = []; return this } }
      if (selector === '.presets-status') return { text: function (value) { state.status = value } }
      if (selector === '.preset-upload-form button[type=submit]') {
        return {
          prop: function (name, value) { state.uploadDisabled = value; return this },
          attr: function () { return this }
        }
      }
      if (selector === '.presets-upload-availability') return { text: function (value) { state.availability = value } }
      if (selector === '.mod-update-status') return { text: function () {} }
    }
    view.onRender()
    var presets = callbacks['/api/presets']
    var me = callbacks['/api/accounts/me']
    me.success({})
    assert(state.availability.includes('Restart the server'))
    me.success({ canEditPresets: false })
    assert(state.availability.includes('Presets Edit permission'))
    assert.strictEqual(state.uploadDisabled, true)
    me.success({ canEditPresets: true, canDeletePresets: true })
    assert(state.availability.includes('until the presets list loads'))
    assert.strictEqual(state.uploadDisabled, true)
    presets.success(['<script>.html', 'Preset B.HTML'])
    assert.deepStrictEqual(state.items, ['<script>.html', 'Preset B.HTML'])
    assert.strictEqual(state.links[0].href, '/api/presets/%3Cscript%3E.html')
    assert.strictEqual(state.links[0].download, '<script>.html')
    assert.strictEqual(state.status, '')
    assert.strictEqual(state.uploadDisabled, false)
    assert.strictEqual(state.availability, '')
    assert.strictEqual(state.deleteDisabled, false)
    me.success({ canEditPresets: true, canDeletePresets: false })
    assert.strictEqual(state.deleteDisabled, true)
    presets.success([])
    assert.deepStrictEqual(state.items, [])
    assert.strictEqual(state.status, 'No launcher presets found.')
    presets.failure({ status: 404 })
    assert(state.status.includes('not configured'))
    presets.failure({ status: 500, responseText: 'Unable to read presets folder (EACCES)' })
    assert(state.status.includes('EACCES'))
    presets.success({ unexpected: true })
    assert(state.status.includes('invalid response'))
    view.loadPresets()
    var latest = callbacks['/api/presets']
    latest.success(['new.html'])
    presets.success(['old.html'])
    assert.deepStrictEqual(state.items, ['new.html'])
    presets.failure({ status: 500, responseText: 'Outdated failure' })
    assert.strictEqual(state.status, '')
  })

  it('confirms replacements and refreshes the list after an upload', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'mods', 'list.js'), 'utf8')
    var module = { exports: {} }
    var submitted
    var confirmed = false
    var refreshed = false
    var status
    var input = { files: [{ name: 'EXISTING.html', size: 12 }], value: 'selected' }
    var button = { prop: function () { return this }, attr: function () { return this } }
    var jquery = {
      ajax: function (options) {
        submitted = options
        return {
          done: function (callback) {
            callback()
            return { fail: function () { return { always: function (callback) { callback() } } } }
          }
        }
      }
    }
    var window = {
      confirm: function () { return confirmed },
      FormData: function () { this.append = function () {} }
    }
    var dependencies = {
      jquery: jquery,
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/mods/list_item': {},
      'tpl/mods/list.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      window: window,
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.presets = ['existing.html']
    view.presetsLoaded = true
    view.$ = function (selector) {
      if (selector === '#preset-file') return { get: function () { return input } }
      if (selector === '.preset-upload-status') return { text: function (value) { status = value } }
      return button
    }
    view.loadPresets = function () { refreshed = true }
    view.canEditPresets = false
    view.uploadPreset({ preventDefault: function () {} })
    assert.strictEqual(submitted, undefined)
    view.canEditPresets = true
    view.uploadPreset({ preventDefault: function () {} })
    assert.strictEqual(submitted, undefined)
    confirmed = true
    view.uploadPreset({ preventDefault: function () {} })
    assert.strictEqual(submitted.url, '/api/preset-uploads')
    assert.strictEqual(submitted.headers['X-Requested-With'], 'XMLHttpRequest')
    assert.strictEqual(input.value, '')
    assert.strictEqual(refreshed, true)
    assert.strictEqual(status, 'Preset uploaded.')
  })

  it('confirms deletion, encodes the filename, and refreshes or reports failure', function () {
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'views', 'mods', 'list.js'), 'utf8')
    var module = { exports: {} }
    var submitted
    var success
    var failure
    var confirmed = false
    var refreshed = false
    var status
    var disabled
    var button = {
      data: function () { return 'Preset #1.html' },
      prop: function (name, value) { disabled = value }
    }
    var jquery = function () { return button }
    jquery.ajax = function (options) {
      submitted = options
      return {
        done: function (callback) {
          success = callback
          return { fail: function (callback) { failure = callback } }
        }
      }
    }
    var dependencies = {
      jquery: jquery,
      underscore: underscore,
      marionette: { CompositeView: { extend: function (view) { return view } } },
      'app/views/mods/list_item': {},
      'tpl/mods/list.html': ''
    }
    vm.runInNewContext(source, {
      module: module,
      window: { confirm: function () { return confirmed } },
      require: function (name) { return dependencies[name] }
    })
    var view = module.exports
    view.canDeletePresets = true
    view.$ = function () { return { text: function (value) { status = value } } }
    view.loadPresets = function () { refreshed = true }
    view.deletePreset({ currentTarget: {} })
    assert.strictEqual(submitted, undefined)
    confirmed = true
    view.deletePreset({ currentTarget: {} })
    assert.strictEqual(submitted.url, '/api/preset-uploads/Preset%20%231.html')
    assert.strictEqual(submitted.type, 'DELETE')
    assert.strictEqual(disabled, true)
    failure({ responseText: 'Not allowed' })
    assert.strictEqual(status, 'Not allowed')
    assert.strictEqual(disabled, false)
    success()
    assert.strictEqual(refreshed, true)
  })
})
