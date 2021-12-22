var $ = require('jquery')
var _ = require('underscore')

var ModsListView = require('app/views/mods/list')
var ListItemView = require('app/views/servers/mods/list_item')
var tpl = require('tpl/servers/mods/list.html')

module.exports = ModsListView.extend({
  childView: ListItemView,
  template: _.template(tpl),

  events: {
    'click .check-all': 'checkAll',
    'click .uncheck-all': 'uncheckAll',
    'click .check-all_optional': 'checkAllOptional',
    'click .uncheck-all_optional': 'uncheckAllOptional',
    'click .check-clientside_optional': 'checkClientsideOptional'
  },

  buildChildView: function (item, ChildViewType, childViewOptions) {
    var options = _.extend({ model: item, server: this.options.server}, childViewOptions)
    var view = new ChildViewType(options)
    return view
  },

  changeAllCheckbox: function (checked, name) {
    this.$('input[name='+name+']:checkbox').map(function (idx, el) {
      return $(el).prop('checked', checked)
    })
  },

  checkAll: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(true, "required")
  },

  uncheckAll: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(false, "required")
  },

  checkAllOptional: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(true, "optional")
  },

  uncheckAllOptional: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(false, "optional")
  },

  checkClientsideOptional: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(false, "optional")
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().startsWith("clientside"))
    })

  },

  serialize: function () {
    return {
      mods: this.$('input[name="required"]:checkbox:checked').map(function (idx, el) {
        return $(el).val()
      }).get(),
      mods_optional: this.$('input[name="optional"]:checkbox:checked').map(function (idx, el) {
        return $(el).val()
      }).get()
    }
  }
})
