var _ = require('underscore')
var Backbone = require('backbone')
var Marionette = require('marionette')
var sweetAlert = require('sweet-alert')

var tpl = require('tpl/servers/form.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  initialize: function (options) {
    this.servers = options.servers
    this.bind('ok', this.submit)
  },

  events: {
    'change #game_selected': 'onSelectionChange'
  },

  serialize: function () {
    return {
      game_selected: this.$('form .game_selected').val(),
      title: this.$('form .title').val(),
      uid: this.$('form .uid').val(),
      port: this.$('form .port').val(),
      password: this.$('form .password').val(),
      admin_password: this.$('form .admin-password').val(),
      allowed_file_patching: this.$('form .allowed-file-patching').prop('checked') ? 2 : 1,
      auto_start: this.$('form .auto-start').prop('checked'),
      virtual_server: this.$('form .virtual_server').prop('checked'),
      battle_eye: this.$('form .battle-eye').prop('checked'),
      file_patching: this.$('form .file-patching').prop('checked'),
      forcedDifficulty: this.$('form .forcedDifficulty').val(),
      max_players: this.$('form .max-players').val(),
      motd: this.$('form .motd').val(),
      number_of_headless_clients: this.$('form .headless-clients').val(),
      persistent: this.$('form .persistent').prop('checked'),
      von: this.$('form .von').prop('checked'),
      verify_signatures: this.$('form .verify_signatures').prop('checked'),
      additionalConfigurationOptions: this.$('form .additional-configuration-options').val(),
      cbaConfigurationOptions: this.$('form .cba-configuration-options').val()
    }
  },

  onRender: function() {
    var self = this;
  
    // Check if cached games data exists
    if (window.cachedGamesData) {
      self.populateGameSelect(window.cachedGamesData);
    } else {
      // Fetch games data from the API and cache it
      $.get('/api/games').done(function(data) {
        window.cachedGamesData = data; // Cache the data globally
        self.populateGameSelect(data);
      }).fail(function() {
        console.error('Failed to fetch games data');
      });
    }
  },

  populateGameSelect: function(data) {
    var gameSelectElement = this.$('#game_selected');
    var gameSelected = this.model.get('game_selected');
  
    // Empty the options so that we can refresh them and set up the default selected on render
    gameSelectElement.empty();
  
    // Loop through the games and add them to the dropdown selector
    Object.entries(data).forEach(([key, value]) => {
      gameSelectElement.append($('<option>', {
        value: key,
        text: value.displayName
      }));
    });
  
    // Auto-select the selected game saved to the model settings
    gameSelectElement.val(gameSelected);
    var gameSelected = this.$('form .game_selected').val();
    this.$('.cc').hide();
    this.$('.cc-' + gameSelected).show();
  },

  onSelectionChange: function() {
    var selectedValue = this.$('form .game_selected').val();
    this.$('.cc').hide();
    this.$('.cc-' + selectedValue).show();
  },

  submit: function (modal) {
    modal.preventClose()

    var data = this.serialize()

    if (!data.title) {
      sweetAlert({
        title: 'Error',
        text: 'Server title cannot be empty',
        type: 'error'
      })
      return
    }

    this.model.set(data)

    var self = this

    this.model.save({}, {
      success: function () {
        modal.close()
        self.servers.fetch({
          success: function () {
            Backbone.history.navigate('#servers/' + self.model.get('id'), true)
          }
        })
      },
      error: function (model, response) {
        sweetAlert({
          title: 'Error',
          text: response.responseText,
          type: 'error'
        })
      }
    })
  }
})
