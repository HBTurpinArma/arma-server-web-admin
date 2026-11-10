var $ = require('jquery')
var _ = require('underscore')
var Backbone = require('backbone')
var Marionette = require('marionette')

var LayoutView = require('app/views/layout')
var NavigationView = require('app/views/navigation')
var ServersView = require('app/views/servers/list')
var LogsListView = require('app/views/logs/list')
var MissionsView = require('app/views/missions/index')
var ModsListView = require('app/views/mods/list')
var ServerView = require('app/views/servers/view')
var AccountsView = require('app/views/accounts')
var AuditLogView = require('app/views/audit-log')
var Logs = require('app/collections/logs')
var Missions = require('app/collections/missions')
var Mods = require('app/collections/mods')
var Settings = require('app/models/settings')
var Servers = require('app/collections/servers')
var permissions = require('app/permissions')
var PermissionPage = require('app/views/permission-page')

var $body = $('body')
var missions = new Missions()
var mods = new Mods()
var settings = new Settings()
var servers = new Servers()
var layoutView = new LayoutView({ el: $body }).render()

module.exports = Backbone.Router.extend({

  routes: {
    logs: 'logs',
    missions: 'missions',
    mods: 'mods',
    accounts: 'accounts',
    'audit-log': 'auditLog',
    'servers/:id': 'server',
    '': 'home'
  },

  initialize: function () {
    permissions.refresh()
    layoutView.navigation.show(new NavigationView())

    var initialized = false
    var connected = false

    /* global io */
    var socket = io.connect()
    socket.on('connect', function () {
      if (connected) permissions.refresh()
      connected = true
    })
    socket.on('disconnect', function () {
      $.get('/api/accounts/me')
    })
    socket.on('connect_error', function () {
      $.get('/api/accounts/me')
    })
    socket.on('missions', function (_missions) {
      missions.set(_missions)
    })
    socket.on('mods', function (_mods) {
      mods.set(_mods)
    })
    socket.on('servers', function (_servers) {
      servers.set(_servers)
    })
    socket.on('settings', function (_settings) {
      settings.set(_settings)
      if (!initialized) {
        initialized = true
        Backbone.history.start()
      }
    })
    socket.on('permissions-changed', function () { permissions.refresh() })
  },

  home: function () {
    layoutView.content.show(new PermissionPage({
      group: 'servers',
      title: 'Servers',
      createView: function () { return new ServersView({ collection: servers }) }
    }))
  },

  logs: function () {
    var logs = new Logs()
    logs.fetch()
    layoutView.content.show(new LogsListView({ collection: logs }))
  },

  missions: function () {
    layoutView.content.show(new PermissionPage({
      group: 'missions',
      title: 'Missions',
      createView: function () { return new MissionsView({ missions: missions }) }
    }))
  },

  mods: function () {
    layoutView.content.show(new PermissionPage({
      group: 'mods',
      title: 'Mods',
      createView: function () { return new ModsListView({ collection: mods }) }
    }))
  },

  accounts: function () {
    layoutView.content.show(new AccountsView())
  },

  auditLog: function () {
    layoutView.content.show(new AuditLogView())
  },

  server: function (id) {
    layoutView.content.show(new PermissionPage({
      group: 'servers',
      title: 'Servers',
      createView: function () {
        var server = servers.get(id)
        if (!server) {
          return new Marionette.ItemView({
            template: _.template('<section class="panel panel-default"><div class="panel-heading"><h2 class="panel-title">Servers</h2></div><div class="panel-body">Server not found.</div></section>')
          })
        }
        return new ServerView({ model: server, missions: missions, mods: mods })
      }
    }))
  }

})
