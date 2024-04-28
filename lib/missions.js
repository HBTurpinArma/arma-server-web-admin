var async = require('async')
var events = require('events')
var filesize = require('filesize')
var fs = require('fs.extra')
var path = require('path')
var SteamWorkshop = require('steam-workshop')

var Missions = function (config) {
  this.config = config
  this.missions = []
  //this.steamWorkshop = new SteamWorkshop(this.missionsPath("arma3"))
  this.updateMissions()
}

Missions.prototype = new events.EventEmitter()

Missions.prototype.canUserView = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.missions.view || false
}

Missions.prototype.canUserCreate = function(user){
  return this.config.auth.find(u => u.username == user).permissions.missions.create || false
}

Missions.prototype.canUserDelete = function(user){
  return this.config.auth.find(u => u.username == user).permissions.missions.delete || false
}

Missions.prototype.missionsPath = function (gameKey) {
  return this.config.games[gameKey]?.missionPath || null
}

Missions.prototype.missionPath = function (gameKey, name) {
  return path.join(this.missionsPath(gameKey), name)
}

Missions.prototype.updateMissions = function (cb) {
  var self = this

  async.each(Object.keys(self.config.games), function (gameKey, callback) {
    if (!self.missionsPath(gameKey)) {return}
    fs.readdir(self.missionsPath(gameKey), function (err, files) {
      if (err) {
        console.log(err)
        if (cb) {
          return cb(err)
        }
        return
      }

      async.map(files, function (filename, cb) {
        fs.stat(self.missionPath(gameKey, filename), function (err, stat) {
          if (err) {
            console.log(err)
            return cb(err)
          }

          var filenameWithoutPbo = path.basename(filename, '.pbo')
          var worldName = path.extname(filenameWithoutPbo)
          var missionName = path.basename(filenameWithoutPbo, worldName)
          worldName = worldName.replace('.', '')

          cb(null, {
            dateCreated: new Date(stat.ctime),
            dateModified: new Date(stat.mtime),
            missionName: missionName,
            game: gameKey,
            name: filename,
            size: stat.size,
            sizeFormatted: filesize(stat.size),
            worldName: worldName
          })
        })
      }, function (err, missions) {
        if (!err) {
          self.missions = missions
          self.emit('missions', missions)
        }

        if (cb) {
          cb(err, missions)
        }
      })
    })
  })
}

Missions.prototype.handleUpload = function (gameKey, uploadedFile, cb) {
  var filename = decodeURI(uploadedFile.originalname.toLowerCase())
  var self = this

  fs.move(uploadedFile.path, path.join(this.missionsPath(gameKey), filename), function (err) {
    self.updateMissions()

    if (cb) {
      cb(err)
    }
  })
}

Missions.prototype.getGames = function (cb) {
  if (cb) {
    cb(this.config.games)
  }
}

Missions.prototype.delete = function (gameKey, missionName, cb) {
  var self = this
  fs.unlink(path.join(this.missionsPath(gameKey), missionName), function (err) {
    self.updateMissions()

    if (cb) {
      cb(err)
    }
  })
}

Missions.prototype.downloadSteamWorkshop = function (id, cb) {
  if (!id) {
    return cb(new Error('Not a valid Steam Workshop ID: ' + id))
  }

  var self = this

  this.steamWorkshop.downloadFile(id, function (err) {
    self.updateMissions()

    if (cb) {
      cb(err)
    }
  })
}

module.exports = Missions
