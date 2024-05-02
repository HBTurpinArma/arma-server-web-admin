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
    'click .preset-battalion': 'setPresetBattlaion',
    'click .preset-ww2': 'setPresetWW2',
  },

  onRender: function() {
    //Select saved option from the model on render.
    var game_selected = this.options.server.get('game_selected')
    this.$('.cc').hide();
    this.$('.cc-' + game_selected).show();
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

  setPresetBattlaion: function (e) {
    e.preventDefault()

    this.changeAllCheckbox(false, "optional")
    var filter = "clientside\\"
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })

    var filter = "battalion\\"
    this.$('input[name=required]:checkbox').map(function (idx, el) {
      return ($(el).prop('checked', $(el).val().includes(filter) && !($(el).val().includes("\\optionals\\"))))
    })

    var filter = "serverside\\"
    this.$('input[name=server_only]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })
  },

  setPresetWW2: function (e) {
    e.preventDefault()

    this.changeAllCheckbox(false, "optional")
    var filter = "clientside_ww2/"
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })

    var filter = "battalion_ww2/"
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
      }).get(),
      mods_server_only: this.$('input[name="server_only"]:checkbox:checked').map(function (idx, el) {
        return $(el).val()
      }).get()
    }
  },

  templateHelpers: function () {
    return {
      game_selected: this.options.server.get('game_selected')
    }
  }
})
