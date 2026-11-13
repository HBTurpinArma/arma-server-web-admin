var Backbone = require('backbone')
var Marionette = require('marionette')

var reset = Marionette.Region.prototype.reset

// Marionette 2 relies on the jQuery .selector property, which jQuery 3 removed.
Marionette.Region.prototype.reset = function () {
  var el = this.getOption('el')
  if (el instanceof Backbone.$) el = el[0]
  reset.apply(this, arguments)
  this.el = el
  return this
}
