var Backbone = require('backbone')

module.exports = Backbone.Model.extend({
  defaults: {
    name: '',
    formattedDate: '',
    date: '',
    formattedSize: '0 B',
    size: 0
  },
  idAttribute: 'name'
})
