var $ = require('jquery')
var _ = require('underscore')
var Marionette = require('marionette')
var permissions = require('app/permissions')

var template = _.template(require('tpl/audit-log.html'))
var rows = _.template(require('tpl/audit-log-rows.html'))

module.exports = Marionette.ItemView.extend({
  template: template,

  events: {
    'click .audit-refresh': 'refresh',
    'click .audit-more': 'loadMore',
    'submit .audit-filter': 'applyFilter'
  },

  initialize: function () {
    this.listenTo(permissions, 'change:permissionsStatus', this.updatePermission)
  },

  onRender: function () {
    this.updatePermission()
  },

  onDestroy: function () {
    if (this.request) this.request.abort()
  },

  updatePermission: function () {
    if (!this.isRendered) return
    if (this.request) this.request.abort()
    this.request = null
    this.$('.audit-rows').empty()
    this.$('.audit-more').hide()
    var status = permissions.get('permissionsStatus')
    this.$('#audit-user, #audit-action, .audit-apply').prop('disabled', status !== 'ready' || !permissions.get('canViewAuditLog'))
    if (status !== 'ready') {
      this.$('.audit-status').text(status === 'error' ? 'Unable to check account permissions.' : 'Checking account permissions...')
      this.$('.audit-refresh').prop('disabled', true)
      return
    }
    if (!permissions.get('canViewAuditLog')) {
      this.$('.audit-status').text('You do not have permission to view the panel audit log.')
      this.$('.audit-refresh').prop('disabled', true)
      return
    }
    this.refresh()
  },

  refresh: function () {
    this.$('.audit-rows').empty()
    this.$('.audit-more').hide()
    this.cursor = null
    this.filters = {
      user: this.$('#audit-user').val().trim(),
      action: this.$('#audit-action').val().trim()
    }
    this.load()
  },

  applyFilter: function (event) {
    event.preventDefault()
    this.refresh()
  },

  loadMore: function () {
    this.load(this.cursor)
  },

  load: function (cursor) {
    var self = this
    if (this.request) this.request.abort()
    this.$('.audit-refresh, .audit-more').prop('disabled', true)
    this.$('.audit-status').text('Loading audit events...')
    var data = { user: this.filters.user, action: this.filters.action }
    if (cursor !== undefined) data.cursor = cursor
    var continueSearch = false
    this.request = $.ajax({
      url: '/api/audit-log',
      dataType: 'json',
      data: data
    }).done(function (result) {
      self.$('.audit-rows').append(rows({ entries: result.entries }))
      self.cursor = result.nextCursor
      self.$('.audit-more').toggle(result.nextCursor !== null)
      continueSearch = !result.entries.length && result.nextCursor !== null
      self.$('.audit-status').text(continueSearch ? 'Searching older audit events...' : (result.entries.length ? '' : (cursor === undefined ? 'No matching audit events found.' : 'No more matching audit events.')))
    }).fail(function (response, status) {
      if (status === 'abort') return
      if (response.status === 401 || response.status === 403) {
        self.$('.audit-rows').empty()
        self.$('.audit-more').hide()
        self.$('#audit-user, #audit-action, .audit-apply').prop('disabled', true)
      }
      self.$('.audit-status').text(response.responseText || 'Unable to load audit events.')
    }).always(function () {
      self.request = null
      if (continueSearch) return self.load(self.cursor)
      self.$('.audit-refresh, .audit-more').prop('disabled', false)
    })
  }
})
