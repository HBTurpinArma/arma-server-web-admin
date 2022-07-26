var $ = require('jquery')
var _ = require('underscore')

var ModsListView = require('app/views/mods/list')
var ListItemView = require('app/views/servers/mods/list_item')
var tpl = require('tpl/servers/mods/list.html')

module.exports = ModsListView.extend({
  childView: ListItemView,
  template: _.template(tpl),

  events: {
    'click .toggle-required': 'toggleRequired',
    'click .toggle-optional': 'toggleOptional',
    'click .check-include-required': 'checkIncludeRequired',
    'click .check-include-optional': 'checkIncludeOptional',
    'keypress #include-required' : 'checkOnEnterRequired',
    'keypress #include-optional' : 'checkOnEnterOptional',
    'click .preset-2nd': 'setPreset2nd',
    'click .preset-4th': 'setPreset4th',
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

  toggleRequired: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(!this.$('input[name=required]:checkbox')[0].checked, "required")
  },

  toggleOptional: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(!this.$('input[name=optional]:checkbox')[0].checked, "optional")
  },

  checkIncludeRequired: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(false, "required")
    //var filter = "clientside"
    var filter = this.$('#include-required').val()
    this.$('input[name=required]:checkbox').map(function (idx, el) {
      return ($(el).prop('checked', $(el).val().includes(filter) && !($(el).val().includes("\\optionals\\"))))
    })
  },

  checkIncludeOptional: function (e) {
    e.preventDefault()
    this.changeAllCheckbox(false, "optional")
    //var filter = "clientside"
    var filter = this.$('#include-optional').val()
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })
  },


  setPreset2nd: function (e) {
    e.preventDefault()

    this.changeAllCheckbox(false, "optional")
    var filter = "2nd_clientside/"
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })

    var filter = "2nd_battalion/"
    this.$('input[name=required]:checkbox').map(function (idx, el) {
      return ($(el).prop('checked', $(el).val().includes(filter) && !($(el).val().includes("\\optionals\\"))))
    })
  },

  setPreset4th: function (e) {
    e.preventDefault()

    this.changeAllCheckbox(false, "optional")
    var filter = "4th_clientside/"
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })

    var filter = "4th_legion/"
    this.$('input[name=required]:checkbox').map(function (idx, el) {
      return ($(el).prop('checked', $(el).val().includes(filter) && !($(el).val().includes("\\optionals\\"))))
    })
  },

  checkOnEnterRequired: function(e){
    if ( e.which === 13 ) { 
      var keywords = $(e.target).val();
      var filter = this.$('#include-required').val()
      this.$('input[name=required]:checkbox').map(function (idx, el) {
        return ($(el).prop('checked', $(el).val().includes(filter) && !($(el).val().includes("\\optionals\\"))))
      })
      e.preventDefault()
      if(keywords === '') return;
    }
  },

  checkOnEnterOptional: function(e){
    if ( e.which === 13 ) { 
      var keywords = $(e.target).val();
      var filter = this.$('#include-optional').val()
      this.$('input[name=optional]:checkbox').map(function (idx, el) {
        return $(el).prop('checked', $(el).val().includes(filter))
      })
      e.preventDefault()
      if(keywords === '') return;
    }
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
