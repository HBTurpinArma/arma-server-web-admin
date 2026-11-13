var _ = require('underscore')
var Marionette = require('marionette')
var permissions = require('app/permissions')
var tpl = require('tpl/permission-page.html')

module.exports = Marionette.LayoutView.extend({
  template: function () { return '<div class="permission-page-content"></div>' },

  regions: { content: '.permission-page-content' },

  initialize: function (options) {
    this.group = options.group
    this.title = options.title
    this.createView = options.createView
    this.listenTo(permissions, 'change:permissionsStatus', this.updateContent)
  },

  onRender: function () {
    this.allowed = false
    this.updateContent()
  },

  updateContent: function () {
    if (!this.isRendered || this.isDestroyed) return
    if (permissions.can(this.group, 'view')) {
      if (!this.allowed) {
        this.allowed = true
        this.content.show(this.createView())
      }
    } else {
      this.allowed = false
      this.content.show(new Marionette.ItemView({
        template: _.template(tpl),
        templateHelpers: {
          group: this.group,
          title: this.title,
          status: permissions.get('permissionsStatus')
        }
      }))
    }
  }
})
