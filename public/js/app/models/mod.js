var Backbone = require('backbone')

module.exports = Backbone.Model.extend({
  defaults: {
    name: '',
    id: ''
  },
  idAttribute: 'name',
  urlRoot: '/api/mods/'
})
