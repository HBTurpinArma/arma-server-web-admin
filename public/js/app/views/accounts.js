var _ = require('underscore')
var $ = require('jquery')
var Marionette = require('marionette')
var generatePassword = require('app/password-generator')

var tpl = require('tpl/accounts.html')
var contentTemplate = _.template(require('tpl/accounts-content.html'))

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  events: {
    'click .new-account': 'newAccount',
    'click .edit-account': 'editAccount',
    'click .copy-account': 'copyAccount',
    'click .delete-account': 'deleteAccount',
    'click .generate-password': 'generatePassword',
    'click .show-password': 'showPassword',
    'mouseleave .account-info': 'resetInfo',
    'focusout .account-info': 'resetInfo',
    'submit .account-form': 'saveAccount'
  },

  onRender: function () {
    this.loadAccounts()
  },

  onShow: function () {
    var self = this
    this.dismissInfo = function (event) {
      if (event.key !== 'Escape' && event.keyCode !== 27) return
      self.$('.account-info:hover, .account-info:focus-within').addClass('info-dismissed')
    }
    $(document).on('keydown', this.dismissInfo)
  },

  onDestroy: function () {
    $(document).off('keydown', this.dismissInfo)
  },

  resetInfo: function (event) {
    $(event.currentTarget).removeClass('info-dismissed')
  },

  loadAccounts: function () {
    var self = this
    $.getJSON('/api/accounts').done(function (data) {
      self.accounts = data.accounts
      self.permissions = data.permissions
      self.editing = null
      self.copyDraft = null
      self.renderContent()
    }).fail(function (response) { self.showError(response) })
  },

  renderContent: function () {
    this.$('.accounts-content').html(contentTemplate({
      accounts: this.accounts,
      permissions: this.permissions,
      account: this.editing === null ? (this.copyDraft || {}) : this.accounts[this.editing],
      editing: this.editing !== null
    }))
  },

  showError: function (response) {
    this.$('.accounts-message').addClass('alert alert-danger').text(response.responseText || 'Request failed. Please try again.')
  },

  newAccount: function () {
    this.editing = null
    this.copyDraft = null
    this.renderContent()
  },

  editAccount: function (event) {
    this.editing = Number($(event.currentTarget).attr('data-index'))
    this.copyDraft = null
    this.renderContent()
  },

  copyAccount: function (event) {
    var account = this.accounts[Number($(event.currentTarget).attr('data-index'))]
    this.editing = null
    this.copyDraft = { permissions: account.permissions }
    this.renderContent()
    this.$('#account-username').focus()
  },

  generatePassword: function () {
    if (!window.crypto || !window.crypto.getRandomValues) {
      this.showError({ responseText: 'Secure password generation is unavailable in this browser context. Use HTTPS or enter a password manually.' })
      return
    }
    var password = generatePassword(window.crypto)
    this.$('#account-password').val(password).attr('type', 'text')
    this.$('.show-password').text('Hide')
  },

  showPassword: function () {
    var input = this.$('#account-password')
    var show = input.attr('type') === 'password'
    input.attr('type', show ? 'text' : 'password')
    this.$('.show-password').text(show ? 'Hide' : 'Show')
  },

  saveAccount: function (event) {
    event.preventDefault()
    var self = this
    var values = {}
    Object.keys(this.permissions).forEach(function (group) { values[group] = {} })
    this.$('.permission').each(function () {
      var input = $(this)
      values[input.attr('data-group')][input.attr('data-action')] = input.prop('checked')
    })
    var url = '/api/accounts'
    if (this.editing !== null) url += '/' + encodeURIComponent(this.accounts[this.editing].username)
    this.request({
      url: url,
      method: this.editing === null ? 'POST' : 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({
        username: this.$('#account-username').val(),
        password: this.$('#account-password').val(),
        permissions: values
      })
    }, function () { self.loadAccounts() })
  },

  deleteAccount: function (event) {
    var self = this
    var account = this.accounts[Number($(event.currentTarget).attr('data-index'))]
    if (!window.confirm('Delete account "' + account.username + '"?')) return
    this.request({ url: '/api/accounts/' + encodeURIComponent(account.username), method: 'DELETE' }, function () {
      self.loadAccounts()
    })
  },

  request: function (options, success) {
    var self = this
    this.$('.accounts-message').removeClass('alert alert-danger').empty()
    options.headers = { 'X-Requested-With': 'XMLHttpRequest' }
    $.ajax(options).done(success).fail(function (response) { self.showError(response) })
  }
})
