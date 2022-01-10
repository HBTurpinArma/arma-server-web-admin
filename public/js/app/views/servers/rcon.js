var _ = require('underscore')
var Marionette = require('marionette')

var tpl = require('tpl/servers/rcon/index.html')

module.exports = Marionette.LayoutView.extend({
  template: _.template(tpl),
  templateHelpers: {
    rcon: function () {

    }
  }
})
