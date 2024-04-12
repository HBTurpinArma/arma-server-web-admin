var _ = require('lodash')

var Settings = function (config) {
  this.config = config
}

Settings.prototype.getPublicSettings = function () {
  return _.pick(this.config, ['games', 'type'])
}

module.exports = Settings
