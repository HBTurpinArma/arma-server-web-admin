var _ = require('underscore')
var Marionette = require('marionette')
var sweetAlert = require('sweet-alert')
var permissions = require('app/permissions')

var tpl = require('tpl/missions/list_item.html')

var template = _.template(tpl)

module.exports = Marionette.ItemView.extend({
  tagName: 'tr',
  template: template,

  events: {
    'click .delete': 'deleteMission'
  },

  initialize: function () {
    this.listenTo(permissions, 'change', this.render)
  },

  templateHelpers: function () {
    return { canDelete: permissions.can('missions', 'delete') }
  },

  deleteMission: function (event) {
    if (!permissions.can('missions', 'delete')) return
    var self = this
    sweetAlert({
      title: 'Are you sure?',
      text: 'The mission will be deleted from the server!',
      type: 'warning',
      showCancelButton: true,
      confirmButtonClass: 'btn-danger',
      confirmButtonText: 'Yes, delete it!'
    },
    function () {
      self.model.destroy()
    })
  }
})
