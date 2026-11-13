var $ = require('jquery')
var _ = require('underscore')
var Backbone = require('backbone')
var Marionette = require('marionette')
var sweetAlert = require('sweet-alert')
var permissions = require('app/permissions')

var FormView = require('app/views/servers/form')
var InfoView = require('app/views/servers/info')
var MissionsView = require('app/views/servers/missions/index')
var ModsListView = require('app/views/servers/mods/list')
var ParametersListView = require('app/views/servers/parameters/list')
var PlayersView = require('app/views/servers/players')
var PermissionPage = require('app/views/permission-page')
var tpl = require('tpl/servers/view.html')

module.exports = Marionette.LayoutView.extend({
  template: _.template(tpl),

  regions: {
    infoView: '#tab-info',
    missionsView: '#tab-missions',
    modsView: '#tab-mods',
    parametersView: '#parameters',
    playersView: '#tab-players',
    settingsView: '#settings'
  },

  events: {
    'click .nav-tabs a': 'tabs',
    submit: 'submitForm'
  },

  modelEvents: {
    change: 'serverUpdated'
  },

  initialize: function (options) {
    this.missions = options.missions
    this.mods = options.mods
    this.mods_optional = options.mods_optional
    this.mods_server_only = options.mods_server_only
    this.listenTo(permissions, 'change', this.updateEditPermission)
  },

  templateHelpers: function () {
    return { canEdit: permissions.can('servers', 'edit') }
  },

  onRender: function () {
    var self = this
    this.infoView.show(new InfoView({ model: this.model }))
    this.missionsView.show(new PermissionPage({
      group: 'missions',
      title: 'Missions',
      createView: function () { return new MissionsView({ missions: self.missions, model: self.model }) }
    }))
    this.modsView.show(new PermissionPage({
      group: 'mods',
      title: 'Mods',
      createView: function () { return new ModsListView({ collection: self.mods, server: self.model }) }
    }))
    this.parametersView.show(new ParametersListView({ model: this.model }))
    this.playersView.show(new PlayersView({ model: this.model }))
    this.settingsView.show(new FormView({ model: this.model }))
    this.updateEditPermission()
  },

  updateEditPermission: function () {
    var allowed = permissions.can('servers', 'edit')
    this.$('.server-save-form button[type=submit]').prop('disabled', !allowed)
      .attr('title', allowed ? '' : 'Requires Servers Edit permission')
  },

  serverUpdated: function () {
    this.infoView.currentView.render()
    this.modsView.currentView.render()
    this.parametersView.currentView.render()
    this.playersView.currentView.render()
    this.settingsView.currentView.render()
  },

  submitForm: function (e) {
    e.preventDefault()
    if ($(e.target).is('.server-save-form')) this.save()
  },

  save: function () {
    if (!permissions.can('servers', 'edit')) return

    var self = this
    var oldId = this.model.get('id')
    var data = this.settingsView.currentView.serialize()

    if (!data.title) {
      sweetAlert({
        title: 'Error',
        text: 'Server title cannot be empty',
        type: 'error'
      })
      return
    }

    if (permissions.can('missions', 'view')) {
      _.extend(data, this.missionsView.currentView.content.currentView.serialize())
    }
    if (permissions.can('mods', 'view')) {
      _.extend(data, this.modsView.currentView.content.currentView.serialize())
    }
    _.extend(data, this.parametersView.currentView.serialize())

    this.model.save(data, {
      success: function () {
        if (self.isDestroyed) return
        var newId = self.model.get('id')
        if (oldId !== newId) {
          Backbone.history.navigate('#servers/' + newId, true)
        } else {
          self.serverUpdated()
        }
      },
      error: function (model, response) {
        sweetAlert({
          title: 'Error',
          text: response.responseText || 'Unable to save the server. Check your connection and verify the server settings before retrying.',
          type: 'error'
        })
      }
    })
  },

  tabs: function (e) {
    e.preventDefault()
    $($(e.target).attr('href')).tab('show')
  }
})
