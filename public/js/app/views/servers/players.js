var _ = require('underscore')
var Marionette = require('marionette')

var tpl = require('tpl/servers/players.html')

module.exports = Marionette.LayoutView.extend({
  template: _.template(tpl),

  events: {
    'click #kick': 'kick',
    'click #ban': 'ban'
  },


  // Need to make this a two parter list item thing so the buttons can refer to the player they are nested in.
  // 
  kick: function (event) {
    var self = this
  },






  templateHelpers: {
    players: function () {
      return _.sortBy(this.state.players, function (player) {
        return player.name
      })
    }
  }
})
