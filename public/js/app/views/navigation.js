var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
var Marionette = require('marionette')

var ServersListView = require('app/views/navigation/servers/list')
var tpl = require('tpl/navigation.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  templateHelpers: function () {
    return {
      isActiveRoute: function (route) {
        return Backbone.history.fragment === route ? 'active' : ''
      },
      isServersActive: function () {
        var route = Backbone.history.fragment || ''
        return route === 'missions' || route === 'mods' || route === 'logs' || route.indexOf('servers/') === 0 ? 'active' : ''
      },
      canManageAccounts: !!this.canManageAccounts,
      username: this.username,
      darkMode: window.armaTheme.get() === 'dark'
    }
  },

  initialize: function (options) {
    this.servers = options.servers
    this.serversListView = new ServersListView({ collection: this.servers })
    Backbone.history.on('route', this.render)
    var self = this
    this.themeChanged = function () {
      self.$('.theme-toggle-input').prop('checked', window.armaTheme.get() === 'dark')
    }
    window.addEventListener('arma-theme-change', this.themeChanged)
    $.getJSON('/api/accounts/me').done(function (result) {
      self.canManageAccounts = result.canManage
      self.username = result.username
      self.render()
    }).fail(function () {
      console.error('Unable to check account-management permissions')
    })
  },

  events: {
    'click .account-logout': 'logout',
    'change .theme-toggle-input': 'toggleTheme'
  },

  toggleTheme: function (event) {
    var checkbox = $(event.currentTarget)
    if (!window.armaTheme.set(checkbox.prop('checked') ? 'dark' : 'light')) {
      checkbox.prop('checked', window.armaTheme.get() === 'dark')
      window.alert('Unable to save the theme preference. Check your browser storage settings.')
    }
  },

  logout: function () {
    var button = this.$('.account-logout')
    button.prop('disabled', true)
    $.ajax({
      url: '/api/session/logout',
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).done(function () {
      window.location.assign('/login')
    }).fail(function (response) {
      button.prop('disabled', false)
      window.alert(response.responseText || 'Unable to sign out. Please try again.')
    })
  },

  onDomRefresh: function () {
    this.serversListView.setElement('#servers-list')
    this.serversListView.render()
  },

  onDestroy: function () {
    window.removeEventListener('arma-theme-change', this.themeChanged)
  }
})
