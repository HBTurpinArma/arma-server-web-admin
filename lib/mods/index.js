var async = require('async')
var events = require('events')
var filesize = require('filesize')
var fs = require('fs.extra')
var glob = require('glob')
var path = require('path')

var folderSize = require('./folderSize')
var modFile = require('./modFile')
var steamMeta = require('./steamMeta')

var Mods = function (config) {
  this.config = config
  this.mods = []
}

Mods.prototype = new events.EventEmitter()

Mods.prototype.canUserView = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.mods.view || false
}

Mods.prototype.canUserDelete = function(user ){
  return this.config.auth.find(u => u.username == user).permissions.mods.delete || false
}

Mods.prototype.delete = function (mod, cb) {
  var self = this
  fs.rmrf(path.join(this.config.games[mod.game].modPath, mod), function (err) {
    cb(err)

    if (!err) {
      self.updateMods()
    }
  })
}

Mods.prototype.updateMods = function () {
  var self = this;
  var allMods = [];

  async.each(Object.keys(self.config.games), function (gameKey, callback) {
      var game = self.config.games[gameKey];

      glob('**/{@*,csla,gm,vn,ws}/addons', { cwd: game.path }, function (err, files) {
          if (err) {
              console.log(err);
              callback(err); // Pass error to async callback
              return;
          }
          var mods = files.map(function (file) {
              return path.join(file, '..');
          });

          // Resolve mod data for the current `cwd` path
          async.map(mods, self.resolveModData.bind(self, gameKey), function (err, modsData) {
              if (err) {
                  console.log(err);
                  callback(err); // Pass error to async callback
                  return;
              }

              // Concatenate the mod data to the final array
              allMods = allMods.concat(modsData.map(function(modData) {
                  modData.gameKey = gameKey; // Adding gameKey to modData
                  return modData;
              }));

              callback(); // Notify async that this task is complete
          });
      });
  }, function (err) {
      // This function is called after all `cwd` paths are processed
      if (err) {
          console.error('Error occurred during mod update:', err);
          return;
      }

      // Emit the final mod data to the emitter
      self.mods = allMods;
      self.emit('mods', allMods);
  });
};





Mods.prototype.resolveModData = function (gameKey, modPath, cb) {
  var self = this
  async.parallel({
    folderSize: function (cb) {
      folderSize(modPath, self.config, gameKey, cb)
    },
    modFile: function (cb) {
      modFile(modPath, self.config, gameKey, cb)
    },
    steamMeta: function (cb) {
      steamMeta(modPath, self.config, gameKey, cb)
    }
  }, function (err, results) {
    if (err) {
      return cb(err)
    }

    cb(null, {
      game: gameKey,
      id: modPath,
      name: modPath,
      size: results.folderSize,
      formattedSize: filesize(results.folderSize),
      modFile: results.modFile,
      steamMeta: results.steamMeta
    })
  })
}

module.exports = Mods
