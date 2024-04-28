var Backbone = require('backbone')

var Mod = require('app/models/mod')

module.exports = Backbone.Collection.extend({
  comparator: function (a, b) {
    return (a.get('game')+a.get('name')).toLowerCase().localeCompare((b.get('game')+b.get('name')).toLowerCase())
  },
  model: Mod,
  url: '/api/mods/'
})
