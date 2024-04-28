var _ = require('underscore')
var Backbone = require('backbone')
var Marionette = require('marionette')
var BootstrapModal = require('backbone.bootstrap-modal')

var ServersListView = require('app/views/navigation/servers/list')
var tpl = require('tpl/navigation.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  templateHelpers: function () {
    return {
      isActiveRoute: function (route) {
        return Backbone.history.fragment === route ? 'active' : ''
      }
    }
  },


  initialize: function (options) {
    this.servers = options.servers
    this.serversListView = new ServersListView({ collection: this.servers })
    Backbone.history.on('route', this.render)
  },

  onDomRefresh: function () {
    this.serversListView.setElement('#servers-list')
    this.serversListView.render()
  },
})
