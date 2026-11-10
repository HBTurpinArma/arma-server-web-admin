var $ = require('jquery')
var _ = require('underscore')
var Marionette = require('marionette')
var Ladda = require('ladda')
var permissions = require('app/permissions')

var tpl = require('tpl/missions/upload.html')

module.exports = Marionette.ItemView.extend({
  template: _.template(tpl),

  events: {
    'submit form': 'submit'
  },

  initialize: function () {
    this.listenTo(permissions, 'change', this.updatePermission)
  },

  updatePermission: function () {
    var allowed = permissions.can('missions', 'create')
    var status = permissions.get('permissionsStatus')
    this.$('button[type=submit]').prop('disabled', !allowed || !!this.uploading)
      .attr('title', allowed ? '' : 'Requires Missions Create permission')
    this.$('.mission-upload-permission').text(status === 'error'
      ? 'Unable to check mission upload permission.'
      : (status !== 'ready' ? 'Checking mission upload permission...' : (allowed ? '' : 'You need Missions Create permission to upload missions.')))
  },

  onRender: function() {
    var self = this
    this.updatePermission()

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
    if (!permissions.can('missions', 'create') || this.uploading) return
    var self = this
    var $form = this.$el.find('form')

    var $uploadBtn = $form.find('button[type=submit]')
    var laddaBtn = Ladda.create($uploadBtn.get(0))
    this.uploading = true
    this.$('.mission-upload-status').text('Uploading...')
    laddaBtn.start()

    $.ajax('/api/missions', {
      success: function (data) {
        laddaBtn.stop()
        self.uploading = false
        self.render()
      },
      error: function (response) {
        laddaBtn.stop()
        self.uploading = false
        self.updatePermission()
        self.$('.mission-upload-status').text('Unable to upload missions: ' + (response.responseText || 'request failed.'))
      },
      files: $form.find(':file'),
      data: {
        game: $form.find('#game_selected').val()
      },
      iframe: true
    })
  }
})
