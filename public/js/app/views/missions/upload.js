var $ = require('jquery')
var _ = require('underscore')
var Marionette = require('marionette')
var Ladda = require('ladda')

var tpl = require('tpl/missions/upload.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  events: {
    'click form button': 'submit'
  },

  onRender: function() {
    var self = this

    $.get('/api/games').done(function(data) {
      self.games = data
      var selectElement = self.$('#game_selected');

      Object.entries(data).forEach(([key, value]) => {
        if (value.missionPath){
          selectElement.append($('<option>', {
            value: key,
            text: value.displayName
          }))
        }
      })
    }.bind(this))
  },

  templateHelpers: function () {
    return {
      games: this.games
    }
  },

  submit: function (event) {
    event.preventDefault()
    var self = this
    var $form = this.$el.find('form')

    var $uploadBtn = $form.find('button[type=submit]')
    var laddaBtn = Ladda.create($uploadBtn.get(0))
    laddaBtn.start()

    $.ajax('/api/missions', {
      success: function (data) {
        laddaBtn.stop()
        self.render()
      },
      error: function () {
        laddaBtn.stop()
      },
      files: $form.find(':file'),
      data: {
        game: $form.find('#game_selected').val()
      },
      iframe: true
    })
  }
})
