var events = require('events')
var fs = require('fs')

var Arma3Server = require('./arma3/server')
var ReforgerServer = require('./reforger/server')

var filePath = 'servers.json'

var Manager = function (config, logs) {
  this.config = config
  this.logs = logs
  this.serversArr = []
  this.serversHash = {}
}

Manager.prototype = new events.EventEmitter()

Manager.prototype.canUserView = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.view || false
}

Manager.prototype.canUserEdit = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.edit || false
}

Manager.prototype.canUserCreate = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.create || false
}

Manager.prototype.canUserDelete = function(user ){
  return this.config.auth.find(u => u.username == user).permissions.servers.delete || false
}

Manager.prototype.canUserStart = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.start || false
}

Manager.prototype.canUserStop = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.stop || false
}

Manager.prototype.canUserRCON = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.servers.rcon || false
}

Manager.prototype.addServer = function (options) {
  var server = this._addServer(options)
  this.save()
  return server
}

Manager.prototype.removeServer = function (id) {
  var server = this.serversHash[id]

  if (!server) {
    return {}
  }

  var index = this.serversArr.indexOf(server)
  if (index > -1) {
    this.serversArr.splice(index, 1)
  }
  this.save()

  if (server.pid) {
    server.stop()
  }

  return server
}

Manager.prototype._addServer = function (data) {
  console.log(data)
  if (data.game_selected == "arma3") {
    var server = new Arma3Server(this.config, this.logs, data)
  } else if (data.game_selected == "reforger") {
    var server = new ReforgerServer(this.config, this.logs, data)
  } else {
    console.log("Unrecognised gamekey, no server to be added/saved.")
  }
  this.serversArr.push(server)
  this.serversArr.sort(function (a, b) {
    return (a.title+a.game_selected).localeCompare(b.game_selected + b.title)
  })
  this.serversHash[server.id] = server

  var self = this
  var statusChanged = function () {
    self.emit('servers')
  }
  server.on('state', statusChanged)

  return server
}

Manager.prototype.getServer = function (id) {
  return this.serversHash[id]
}

Manager.prototype.getServers = function () {
  return this.serversArr
}

Manager.prototype.load = function () {
  var self = this

  fs.readFile(filePath, function (err, data) {
    if (err) {
      console.log('Could not load any existing servers configuration, starting fresh')
      return
    }

    try {
      JSON.parse(data).forEach(function (server) {
        self._addServer(server)
      })
    } catch (e) {
      console.error('Manager load error: ' + e)
    }

    self.getServers().map(function (server) {
      if (server.auto_start) {
        server.start()
      }
    })
  })
}

Manager.prototype.save = function () {
  var data = []
  var self = this

  this.serversArr.sort(function (a, b) {
    return (a.game_selected+a.title).toLowerCase().localeCompare((b.game_selected+b.title).toLowerCase())
  })

  this.serversHash = {}
  this.serversArr.forEach(function (server) {
    data.push({
      game_selected: server.game_selected,
      title: server.title,
      uid: server.uid,
      port: server.port,
      password: server.password,
      admin_password: server.admin_password,
      allowed_file_patching: server.allowed_file_patching,
      auto_start: server.auto_start,
      virtual_server: server.virtual_server,
      battle_eye: server.battle_eye,
      file_patching: server.file_patching,
      forcedDifficulty: server.forcedDifficulty,
      max_players: server.max_players,
      missions: server.missions,
      mods: server.mods,
      mods_optional: server.mods_optional,
      mods_server_only: server.mods_server_only,
      motd: server.motd,
      number_of_headless_clients: server.number_of_headless_clients,
      parameters: server.parameters,
      persistent: server.persistent, 
      von: server.von,
      verify_signatures: server.verify_signatures,
      additionalConfigurationOptions: server.additionalConfigurationOptions,
      cbaConfigurationOptions: server.cbaConfigurationOptions,
    })

    self.serversHash[server.id] = server
  })

  fs.writeFile(filePath, JSON.stringify(data), function (err) {
    if (err) {
      console.error('Manager save error: ' + err)
    } else {
      self.emit('servers')
    }
  })
}








module.exports = Manager
