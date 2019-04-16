var events = require('events')
var fs = require('fs.extra')
var path = require('path')
var execFile = require('child_process').execFile;

var Mods = function (config) {
  this.config = config
  this.mods = []
}

Mods.prototype = new events.EventEmitter()

Mods.prototype.delete = function (mod, cb) {
  var self = this
  fs.rmrf(path.join(this.config.path, mod), function (err) {
    cb(err)

    if (!err) {
      self.updateMods()
    }
  })
}

Mods.prototype.updateMods = function () {
  var self = this
  execFile('find', [path.join(this.config.path, this.config.modPath), '-maxdepth', '2', '-type', 'd', '-name', '@*'], function(err, stdout, stderr) {
    if(err) {
      console.log(err)
    } else {
      var mods = stdout.split('\n').filter(function (filepath) {
          return filepath.charAt(0) === '/'
        }).map(function(filepath) {
          return {
            name: path.relative(self.config.path, filepath)
          }
        })
      self.mods = mods
      self.emit('mods', mods)
    }
  });
}

module.exports = Mods
