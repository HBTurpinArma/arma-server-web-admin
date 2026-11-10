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

  initialize: function () {
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
  }
})
