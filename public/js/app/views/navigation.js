var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
var Marionette = require('marionette')

var permissions = require('app/permissions')
var tpl = require('tpl/navigation.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  templateHelpers: function () {
    return {
      isActiveRoute: function (route) {
        return Backbone.history.fragment === route ? 'active' : ''
      },
      canManageAccounts: !!this.canManageAccounts,
      canViewAuditLog: !!this.canViewAuditLog,
      username: this.username,
      navigationTitle: window.armaBranding.navigationTitle,
      darkMode: window.armaTheme.get() === 'dark'
    }
  },

  initialize: function () {
    Backbone.history.on('route', this.render)
    var self = this
    this.themeChanged = function () {
      self.$('.theme-toggle-input').prop('checked', window.armaTheme.get() === 'dark')
    }
    window.addEventListener('arma-theme-change', this.themeChanged)
    this.listenTo(permissions, 'change:permissionsStatus', this.updateAccount)
    this.updateAccount()
  },

  updateAccount: function () {
    var ready = permissions.get('permissionsStatus') === 'ready'
    this.canManageAccounts = ready && permissions.get('canManage')
    this.canViewAuditLog = ready && permissions.get('canViewAuditLog')
    this.username = ready ? permissions.get('username') : null
    if (this.isRendered) this.render()
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

  onDestroy: function () {
    window.removeEventListener('arma-theme-change', this.themeChanged)
  }
})
