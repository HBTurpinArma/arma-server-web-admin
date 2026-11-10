var Backbone = require('backbone')

var permissions = new Backbone.Model()

permissions.url = '/api/accounts/me'
permissions.can = function (group, action) {
  var current = this.get('permissions')
  return !!(this.get('permissionsStatus') === 'ready' && current && current[group] && current[group][action] === true)
}

permissions.refresh = function () {
  var self = this
  if (this.request && this.request.readyState !== 4) this.request.abort()
  this.set('permissionsStatus', 'loading')
  this.unset('permissions')
  this.request = this.fetch({
    success: function () {
      self.set('permissionsStatus', 'ready')
    },
    error: function (model, response) {
      if (response.statusText === 'abort') return
      self.clear()
      self.set('permissionsStatus', 'error')
      console.error('Unable to load account permissions:', response.status)
    }
  })
}

module.exports = permissions
