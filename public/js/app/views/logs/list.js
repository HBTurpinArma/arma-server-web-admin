var _ = require('underscore')
var Marionette = require('marionette')
var permissions = require('app/permissions')

var FileListView = require('app/views/logs/file_list')
var tpl = require('tpl/logs/list.html')

var template = _.template(tpl)

module.exports = Marionette.LayoutView.extend({
  template: template,

  regions: {
    rptList: '#rpt-list',
    logList: '#log-list'
  },

  events: {
    'click .refresh-logs': 'refresh'
  },

  initialize: function () {
    this.refreshing = false
    this.refreshStatus = ''
    this.listenTo(permissions, 'change:permissionsStatus', this.render)
  },

  templateHelpers: function () {
    return {
      canView: permissions.can('logs', 'view'),
      permissionsStatus: permissions.get('permissionsStatus')
    }
  },

  onRender: function () {
    if (!permissions.can('logs', 'view')) return
    this.rptList.show(new FileListView({ collection: this.collection, extension: '.rpt' }))
    this.logList.show(new FileListView({ collection: this.collection, extension: '.log' }))
    this.updateRefreshStatus()
  },

  updateRefreshStatus: function () {
    this.$('.refresh-logs').prop('disabled', this.refreshing)
    this.$('.logs-refresh-status').text(this.refreshStatus)
  },

  refresh: function () {
    if (this.refreshing || !permissions.can('logs', 'view')) return
    var self = this
    this.refreshing = true
    this.refreshStatus = 'Refreshing log files...'
    this.updateRefreshStatus()
    this.collection.fetch({
      success: function () {
        self.refreshing = false
        self.refreshStatus = 'Log files refreshed.'
        if (!self.isDestroyed) self.updateRefreshStatus()
      },
      error: function (collection, response) {
        self.refreshing = false
        self.refreshStatus = 'Unable to refresh log files: ' + (response.responseText || 'request failed.')
        if (!self.isDestroyed) self.updateRefreshStatus()
      }
    })
  }
})
