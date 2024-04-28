var _ = require('underscore')

var ModListItemView = require('app/views/mods/list_item')
var tpl = require('tpl/servers/mods/list_item.html')

var template = _.template(tpl)

module.exports = ModListItemView.extend({
  tagName: 'tr',
  template: template,

  templateHelpers: function () {
    var modFile = this.model.get('modFile')
    var steamMeta = this.model.get('steamMeta')
    
    var link = null
    var title = null

    if (steamMeta && steamMeta.id) {
      if (steamMeta.id) {
        link = 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + steamMeta.id
      }

      if (steamMeta.name) {
        title = steamMeta.name
      }
    }

    if (modFile && modFile.name) {
      title = modFile.name
    }

    return {
      server_only: this.options.server.get('mods_server_only').indexOf(this.model.get('name')) > -1,
      required: this.options.server.get('mods').indexOf(this.model.get('name')) > -1,
      optional: this.options.server.get('mods_optional').indexOf(this.model.get('name')) > -1,
      game_selected: this.options.server.get('game_selected'),
      link: link,
      title: title
    }
  }
})
