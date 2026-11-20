var _ = require('underscore')
var Marionette = require('marionette')

var ListItemView = require('app/views/logs/list_item')
var tpl = require('tpl/logs/file_list.html')

module.exports = Marionette.CompositeView.extend({
  childView: ListItemView,
  childViewContainer: 'tbody',
  template: _.template(tpl),

  initialize: function (options) {
    this.extensions = options.extensions || [options.extension]
    this.source = options.source || 'primary'
  },

  filter: function (child) {
    var names = child.get('files')
      ? child.get('files').map(function (file) { return file.name.toLowerCase() })
      : [child.get('name').toLowerCase()]
    var matchesExtension = this.extensions.some(function (extension) {
      return names.some(function (name) { return name.endsWith(extension) })
    })
    return (child.get('source') || 'primary') === this.source && matchesExtension
  }
})
