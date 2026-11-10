var _ = require('underscore')
var Marionette = require('marionette')

var ListItemView = require('app/views/logs/list_item')
var tpl = require('tpl/logs/file_list.html')

module.exports = Marionette.CompositeView.extend({
  childView: ListItemView,
  childViewContainer: 'tbody',
  template: _.template(tpl),

  initialize: function (options) {
    this.extension = options.extension
  },

  filter: function (child) {
    return child.get('name').endsWith(this.extension)
  }
})
