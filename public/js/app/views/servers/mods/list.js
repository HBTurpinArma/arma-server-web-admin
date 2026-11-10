var $ = require('jquery')
var _ = require('underscore')

var ModsListView = require('app/views/mods/list')
var ListItemView = require('app/views/servers/mods/list_item')
var tpl = require('tpl/servers/mods/list.html')

module.exports = ModsListView.extend({
  childView: ListItemView,
  childViewContainer: 'tbody',
  template: _.template(tpl),


  events: {
    'click .toggle-server-only': 'toggleServerOnly',
    'click .check-include-server-only': 'checkIncludeServerOnly',
    'keypress #include-server-only': 'checkOnEnterServerOnly',
    'click .toggle-required': 'toggleRequired',
    'click .toggle-optional': 'toggleOptional',
    'click .check-include-required': 'checkIncludeRequired',
    'click .check-include-optional': 'checkIncludeOptional',
    'keypress #include-required' : 'checkOnEnterRequired',
    'keypress #include-optional' : 'checkOnEnterOptional',
    'click .preset-battalion': 'setPresetAM2',
    'click .preset-am2035': 'setPresetAM2035',
    'click .preset-ww2': 'setPresetWW2',
    'keydown .account-info-trigger': 'dismissInfo',
    'mouseleave .account-info': 'resetInfo',
    'focusout .account-info': 'resetInfo'
  },

  dismissInfo: function (event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      $(event.currentTarget).closest('.account-info').addClass('info-dismissed')
    }
  },

  resetInfo: function (event) {
    $(event.currentTarget).removeClass('info-dismissed')
  },

  onRender: function() {
    //Select saved option from the model on render.
    var game_selected = this.options.server.get('game_selected')
    this.$('.cc').hide();
    this.$('.cc-' + game_selected).show();
    var reforgerMods = this.$('form .reforger-mods');
    var stringedMods = JSON.stringify(this.options.server.get('mods'));
    reforgerMods.val(stringedMods);
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

  toggleServerOnly: function (e) {
    e.preventDefault()
    var checkboxes = this.$('input[name=server_only]:checkbox')
    if (checkboxes.length) this.changeAllCheckbox(!checkboxes[0].checked, 'server_only')
  },

  checkIncludeServerOnly: function (e) {
    e.preventDefault()
    var filter = this.$('#include-server-only').val()
    this.$('input[name=server_only]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes(filter))
    })
  },

  checkOnEnterServerOnly: function (e) {
    if (e.which === 13) this.checkIncludeServerOnly(e)
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

  applyModPreset: function (requiredPath, dlcs) {
    this.$('input[name=optional]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes('clientside\\'))
    })
    this.$('input[name=required]:checkbox').map(function (idx, el) {
      var name = $(el).val()
      return $(el).prop('checked', dlcs.indexOf(name.toLowerCase()) !== -1 ||
        (name.includes(requiredPath) && !name.includes('\\optionals\\')))
    })
    this.$('input[name=server_only]:checkbox').map(function (idx, el) {
      return $(el).prop('checked', $(el).val().includes('serverside\\'))
    })
  },

  setPresetAM2: function (e) {
    e.preventDefault()
    this.applyModPreset('am2\\', ['ws'])
  },

  setPresetAM2035: function (e) {
    e.preventDefault()
    this.applyModPreset('am2035\\', ['ws', 'rf', 'ef'])
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
    if (this.options.server.get('game_selected') == "arma3") {
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
    } else if (this.options.server.get('game_selected') == "reforger") {
      mods_json = this.$('form .reforger-mods').val().replace(/(\r\n|\n|\r)/gm, "")
      return {
        mods: JSON.parse([mods_json])
      }
    } 
  },

  templateHelpers: function () {
    return {
      game_selected: this.options.server.get('game_selected')
    }
  }
})
