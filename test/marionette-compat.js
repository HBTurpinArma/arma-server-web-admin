var assert = require('assert')
var Backbone = require('backbone')
var fs = require('fs')
var Marionette = require('backbone.marionette')
var path = require('path')
var vm = require('vm')

describe('Marionette region compatibility', function () {
  var originalReset

  before(function () {
    originalReset = Marionette.Region.prototype.reset
    var source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app', 'marionette-compat.js'), 'utf8')
    vm.runInNewContext(source, {
      require: function (name) { return name === 'backbone' ? Backbone : Marionette }
    })
  })

  after(function () {
    Marionette.Region.prototype.reset = originalReset
  })

  it('retains the selector across repeated resets without jQuery selector metadata', function () {
    var emptied = 0
    var region = {
      options: { el: '.permission-page-content' },
      el: { nodeType: 1 },
      $el: { length: 1 },
      getOption: Marionette.Region.prototype.getOption,
      empty: function () { emptied++ }
    }
    Marionette.Region.prototype.reset.call(region)
    assert.strictEqual(region.el, '.permission-page-content')
    assert.strictEqual(region.$el, undefined)
    assert.strictEqual(emptied, 1)

    region.el = { nodeType: 1 }
    region.$el = { length: 1 }
    Marionette.Region.prototype.reset.call(region)
    assert.strictEqual(region.el, '.permission-page-content')
    assert.strictEqual(emptied, 2)
  })

  it('preserves a DOM element configured as the region root', function () {
    var element = { nodeType: 1 }
    var region = {
      options: { el: element },
      el: element,
      $el: { length: 1 },
      getOption: Marionette.Region.prototype.getOption,
      empty: function () {}
    }
    Marionette.Region.prototype.reset.call(region)
    assert.strictEqual(region.el, element)
  })
})
