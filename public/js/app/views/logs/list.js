var _ = require('underscore')
var Marionette = require('marionette')
var permissions = require('app/permissions')

var ListItemView = require('app/views/logs/list_item')
var tpl = require('tpl/logs/list.html')

var template = _.template(tpl)

module.exports = Marionette.CompositeView.extend({
  childView: ListItemView,
  childViewContainer: 'tbody',
  template: template,

  initialize: function () {
    this.listenTo(permissions, 'change', this.render)
  },

  templateHelpers: function () {
    return {
      canView: permissions.can('logs', 'view'),
      permissionsStatus: permissions.get('permissionsStatus')
    }
  }
})
