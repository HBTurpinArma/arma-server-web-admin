var Backbone = require('backbone')

var Server = require('app/models/server')

module.exports = Backbone.Collection.extend({
  comparator: function (a, b) {
    return (a.get('game_selected')+a.get('title')).toLowerCase().localeCompare((b.get('game_selected')+b.get('title')).toLowerCase())
  },
  model: Server,
  url: '/api/servers/'
})
