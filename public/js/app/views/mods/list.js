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
    this.loadPresets()
    $.getJSON('/api/accounts/me').done(function (result) {
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
    })
  },

  updateUploadVisibility: function () {
    this.$('.presets-upload-panel').prop('hidden', !(this.canEditPresets && this.presetsLoaded))
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
    return $.getJSON('/api/presets').done(function (presets) {
      if (requestId !== self.presetsRequestId) return
      if (!Array.isArray(presets) || !presets.every(function (name) { return typeof name === 'string' })) {
        self.$('.presets-status').text('Unable to load presets: invalid response.')
        return
      }
      self.presets = presets
      self.presetsLoaded = true
      self.renderPresets()
      self.$('.presets-status').text(presets.length ? '' : 'No launcher presets found.')
      self.$('.presets-builder').prop('hidden', false)
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
      $('<tr>').append($('<td>').append(link)).append(actions).appendTo(list)
    })
  },

  events: {
    'click .refresh-presets': 'refreshPresets',
    'click .refresh-mods': 'refreshMods',
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
      button.prop('disabled', false)
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
