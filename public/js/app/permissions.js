var Backbone = require('backbone')

var permissions = new Backbone.Model()

permissions.url = '/api/accounts/me'
permissions.can = function (group, action) {
  var current = this.get('permissions')
  return !!(current && current[group] && current[group][action] === true)
}

permissions.refresh = function () {
  var self = this
  this.clear()
  this.fetch({
    error: function (model, response) {
      self.clear()
      console.error('Unable to load account permissions:', response.status)
    }
  })
}

module.exports = permissions
