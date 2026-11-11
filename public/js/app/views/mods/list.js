var $ = require('jquery')
var _ = require('underscore')
var Marionette = require('marionette')

var ListItemView = require('app/views/mods/list_item')
var tpl = require('tpl/mods/list.html')

var template = _.template(tpl)

module.exports = Marionette.CompositeView.extend({
  childView: ListItemView,
  childViewContainer: 'tbody.mods-list',
  template: template,

  onRender: function () {
    var self = this
    this.updaterGeneration = (this.updaterGeneration || 0) + 1
    var generation = this.updaterGeneration
    clearTimeout(this.updaterTimer)
    this.loadPresets()
    $.getJSON('/api/accounts/me').done(function (result) {
      if (generation !== self.updaterGeneration) return
      self.canUpdateMods = result.canUpdateMods === true
      self.canUpdateGame = result.canUpdateGame === true
      if (self.canUpdateMods || self.canUpdateGame) {
        self.pollModUpdate(generation)
      } else {
        self.$('.mod-update-status').text('Requires an authenticated account with an update permission.')
      }
      if (typeof result.canEditPresets !== 'boolean') {
        self.$('.presets-upload-availability').text('Preset upload is unavailable. Restart the server to load the latest version.')
        return
      }
      self.presetsPermissionChecked = true
      self.canEditPresets = result.canEditPresets === true
      self.canDeletePresets = result.canDeletePresets === true
      self.updateUploadVisibility()
      self.renderPresets()
    }).fail(function (response) {
      self.$('.presets-upload-availability').text('Unable to check preset upload permissions: ' + (response.responseText || 'request failed.'))
      self.$('.mod-update-status').text('Unable to check mod update permission: ' + (response.responseText || 'request failed.'))
    })
  },

  onDestroy: function () {
    this.updaterGeneration = (this.updaterGeneration || 0) + 1
    clearTimeout(this.updaterTimer)
  },

  pollModUpdate: function (generation) {
    var self = this
    $.getJSON('/api/mod-updater').done(function (state) {
      if (generation !== self.updaterGeneration) return
      var label = state.type === 'game' ? 'Game' : 'Mod'
      var messages = {
        idle: 'Ready to update.',
        running: label + ' update running...',
        completed: label + ' update completed.',
        failed: label + ' update failed. See output below.'
      }
      var output = self.$('.mod-update-output')
      var element = output.get(0)
      var follow = element.scrollTop + element.clientHeight >= element.scrollHeight - 20
      output.text(state.outputRestricted ? 'Output requires permission for this update.' : (state.truncated ? '[Earlier output truncated]\n' : '') + state.output)
      if (follow) element.scrollTop = element.scrollHeight
      var anyConfigured = (self.canUpdateMods && state.configured) || (self.canUpdateGame && state.gameConfigured)
      var message = anyConfigured ? (messages[state.status] || 'Unknown update state.') : 'No permitted updater is configured.'
      if (self.updaterError && !state.running) message = self.updaterError
      self.$('.mod-update-status').text(message)
      self.$('.update-mods').prop('disabled', !self.canUpdateMods || !state.configured || state.running || !!self.updaterStarting)
      self.$('.update-game').prop('disabled', !self.canUpdateGame || !state.gameConfigured || state.running || !!self.updaterStarting)
      self.$('.update-mods').attr('title', self.canUpdateMods ? (state.configured ? '' : 'Mod updater is not configured') : 'Requires Mods Update permission')
      self.$('.update-game').attr('title', self.canUpdateGame ? (state.gameConfigured ? '' : 'Game updater is not configured') : 'Requires Servers Update permission')
      self.updaterTimer = setTimeout(function () { self.pollModUpdate(generation) }, 1000)
    }).fail(function (response) {
      if (generation !== self.updaterGeneration) return
      self.$('.update-mods').prop('disabled', true)
      self.$('.update-game').prop('disabled', true)
      self.$('.mod-update-status').text('Unable to read mod update status: ' + (response.responseText || 'request failed.'))
      if (response.status !== 401 && response.status !== 403) {
        self.updaterTimer = setTimeout(function () { self.pollModUpdate(generation) }, 3000)
      }
    })
  },

  startModUpdate: function () {
    this.startUpdate('mods')
  },

  startGameUpdate: function () {
    this.startUpdate('game')
  },

  startUpdate: function (type) {
    if (!(type === 'game' ? this.canUpdateGame : this.canUpdateMods) || this.updaterStarting) return
    var self = this
    var generation = this.updaterGeneration
    this.updaterStarting = true
    this.updaterError = ''
    this.$('.update-mods').prop('disabled', true)
    this.$('.update-game').prop('disabled', true)
    this.$('.mod-update-status').text('Starting ' + (type === 'game' ? 'game' : 'mod') + ' update...')
    $.ajax({
      url: type === 'game' ? '/api/mod-updater/game' : '/api/mod-updater',
      type: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).done(function () {
      if (generation !== self.updaterGeneration) return
      self.$('.mod-update-output').text('')
      self.$('.mod-update-status').text('Updating ' + (type === 'game' ? 'game' : 'mods') + '...')
    }).fail(function (response) {
      if (generation !== self.updaterGeneration) return
      self.updaterError = 'Unable to start update: ' + (response.responseText || 'request failed.')
      self.$('.mod-update-status').text(self.updaterError)
    }).always(function () {
      self.updaterStarting = false
    })
  },

  updateUploadVisibility: function () {
    this.$('.preset-upload-form button[type=submit]')
      .prop('disabled', !(this.canEditPresets && this.presetsLoaded) || !!this.presetUploading)
      .attr('title', this.canEditPresets ? '' : 'Requires Presets Edit permission')
    if (this.presetsPermissionChecked) {
      var message = this.canEditPresets
        ? (this.presetsLoaded ? '' : 'Preset upload is unavailable until the presets list loads.')
        : 'You need Presets Edit permission to upload presets.'
      this.$('.presets-upload-availability').text(message)
    }
  },

  loadPresets: function () {
    var self = this
    var requestId = (this.presetsRequestId || 0) + 1
    this.presetsRequestId = requestId
    this.presetsLoaded = false
    this.updateUploadVisibility()
    return $.getJSON('/api/presets/metadata').done(function (presets) {
      if (requestId !== self.presetsRequestId) return
      if (!Array.isArray(presets) || !presets.every(function (preset) {
        return preset && typeof preset.name === 'string' &&
          typeof preset.lastModified === 'string' && !isNaN(Date.parse(preset.lastModified))
      })) {
        self.$('.presets-status').text('Unable to load presets: invalid response.')
        return
      }
      self.presets = presets.map(function (preset) { return preset.name })
      self.presetLastModified = {}
      presets.forEach(function (preset) { self.presetLastModified[preset.name] = preset.lastModified })
      self.presetsLoaded = true
      self.renderPresets()
      self.$('.presets-status').text(presets.length ? '' : 'No launcher presets found.')
      self.updateUploadVisibility()
    }).fail(function (response) {
      if (requestId !== self.presetsRequestId) return
      self.$('.presets-status').text(response.status === 404
        ? 'Presets are not configured. Set presetsPath in config.js to enable them.'
        : 'Unable to load presets: ' + (response.responseText || 'request failed.'))
    })
  },

  renderPresets: function () {
    var self = this
    var list = this.$('.presets-list').empty()
    ;(this.presets || []).forEach(function (name) {
      var actions = $('<td>')
      $('<button>', { type: 'button', class: 'btn btn-danger btn-xs delete-preset' })
        .append($('<span>', { class: 'glyphicon glyphicon-trash', 'aria-hidden': 'true' }))
        .append(document.createTextNode(' Delete'))
        .attr('aria-label', 'Delete ' + name)
        .attr('title', self.canDeletePresets ? '' : 'Requires Presets Delete permission')
        .prop('disabled', !self.canDeletePresets)
        .data('preset-name', name).appendTo(actions)
      var link = $('<a>', {
        href: '/api/presets/' + encodeURIComponent(name),
        download: name,
        title: 'Download preset'
      }).text(name)
      var lastModified = self.presetLastModified && self.presetLastModified[name]
      var updatedCell = $('<td>').text(lastModified ? new Date(lastModified).toLocaleDateString() : 'Unknown')
      if (lastModified) updatedCell.attr('title', new Date(lastModified).toLocaleString())
      $('<tr>').append($('<td>').append(link)).append(updatedCell).append(actions).appendTo(list)
    })
  },

  events: {
    'click .refresh-presets': 'refreshPresets',
    'click .refresh-mods': 'refreshMods',
    'click .update-mods': 'startModUpdate',
    'click .update-game': 'startGameUpdate',
    'submit .preset-upload-form': 'uploadPreset',
    'click .delete-preset': 'deletePreset'
  },

  deletePreset: function (event) {
    if (!this.canDeletePresets) return
    var self = this
    var button = $(event.currentTarget)
    var name = button.data('preset-name')
    if (!window.confirm('Delete preset "' + name + '"?')) return
    button.prop('disabled', true)
    $.ajax({
      url: '/api/preset-uploads/' + encodeURIComponent(name),
      type: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).done(function () {
      self.loadPresets()
    }).fail(function (response) {
      self.$('.presets-status').text(response.responseText || 'Unable to delete preset.')
      button.prop('disabled', false)
    })
  },

  uploadPreset: function (event) {
    event.preventDefault()
    if (!this.canEditPresets || !this.presetsLoaded || this.presetUploading) return
    var self = this
    var input = this.$('#preset-file').get(0)
    var file = input.files[0]
    var status = this.$('.preset-upload-status')
    if (!file) return status.text('Choose a preset file.')
    if (!/\.html$/i.test(file.name)) return status.text('Choose an .html preset file.')
    if (file.size > 5 * 1024 * 1024) return status.text('The preset exceeds the 5 MiB limit.')
    if (this.presets.some(function (name) { return name.toLowerCase() === file.name.toLowerCase() }) &&
        !window.confirm('Replace existing preset "' + file.name + '"?')) return
    var data = new window.FormData()
    data.append('preset', file)
    var button = this.$('.preset-upload-form button[type=submit]')
    this.presetUploading = true
    button.prop('disabled', true)
    status.text('Uploading...')
    $.ajax({
      url: '/api/preset-uploads',
      type: 'POST',
      data: data,
      processData: false,
      contentType: false,
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).done(function () {
      input.value = ''
      status.text('Preset uploaded.')
      self.loadPresets()
    }).fail(function (response) {
      status.text(response.responseText || 'Unable to upload preset.')
    }).always(function () {
      self.presetUploading = false
      self.updateUploadVisibility()
    })
  },

  refreshPresets: function () {
    var button = this.$('.refresh-presets')
    button.prop('disabled', true)
    this.$('.presets-status').text('Loading presets...')
    this.loadPresets().always(function () {
      button.prop('disabled', false)
    })
  },

  refreshMods: function () {
    var button = this.$('.refresh-mods')
    var status = this.$('.mods-refresh-status')
    button.prop('disabled', true)
    status.text('Requesting mod refresh...')
    $.ajax({
      url: '/api/mods/refresh',
      type: 'POST'
    }).done(function () {
      status.text('Mod refresh requested.')
    }).fail(function (response) {
      status.text('Unable to refresh mods: ' + (response.responseText || 'request failed.'))
    }).always(function () {
      button.prop('disabled', false)
    })
  }
})
