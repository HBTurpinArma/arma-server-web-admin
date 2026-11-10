var $ = require('jquery')
var Backbone = require('backbone')

var LayoutView = require('app/views/layout')
var NavigationView = require('app/views/navigation')
var ServersView = require('app/views/servers/list')
var LogsListView = require('app/views/logs/list')
var MissionsView = require('app/views/missions/index')
var ModsListView = require('app/views/mods/list')
var ServerView = require('app/views/servers/view')
var AccountsView = require('app/views/accounts')
var Logs = require('app/collections/logs')
var Missions = require('app/collections/missions')
var Mods = require('app/collections/mods')
var Settings = require('app/models/settings')
var Servers = require('app/collections/servers')
var permissions = require('app/permissions')

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
    'servers/:id': 'server',
    '': 'home'
  },

  initialize: function () {
    permissions.refresh()
    this.on('route', function () { permissions.refresh() })
    layoutView.navigation.show(new NavigationView({ settings: settings, servers: servers }))

    var initialized = false

    /* global io */
    var socket = io.connect()
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

      if (!initialized) {
        initialized = true
        Backbone.history.start()
      }
    })
    socket.on('settings', function (_settings) {
      settings.set(_settings)
    })
  },

  home: function () {
    layoutView.content.show(new ServersView({ collection: servers }))
  },

  logs: function () {
    var logs = new Logs()
    logs.fetch()
    layoutView.content.show(new LogsListView({ collection: logs }))
  },

  missions: function () {
    layoutView.content.show(new MissionsView({ missions: missions }))
  },

  mods: function () {
    layoutView.content.show(new ModsListView({ collection: mods }))
  },

  accounts: function () {
    layoutView.content.show(new AccountsView())
  },

  server: function (id) {
    var server = servers.get(id)
    if (server) {
      layoutView.content.show(new ServerView({
        model: server,
        missions: missions,
        mods: mods
      }))
    } else {
      this.navigate('#', true)
    }
  }

})
