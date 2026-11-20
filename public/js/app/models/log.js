var Backbone = require('backbone')

module.exports = Backbone.Model.extend({
  defaults: {
    name: '',
    source: 'primary',
    formattedSize: '0 B',
    size: 0
  },
  idAttribute: 'id',

  initialize: function () {
    if (!this.get('id')) {
      this.id = this.get('source') === 'primary'
        ? this.get('name')
        : this.get('source') + '/' + this.get('name')
      this.set('id', this.id, { silent: true })
    }
  },

  url: function () {
    return '/api/logs/' + encodeURIComponent(this.get('source')) + '/' + encodeURIComponent(this.get('name'))
  }
})
