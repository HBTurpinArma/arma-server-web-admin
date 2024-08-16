var childProcess = require('child_process')
var events = require('events')
var fs = require('fs.extra')
const { GameDig } = require('gamedig'); 
var path = require('path')
var slugify = require('slugify')

var queryInterval = 5000

var Server = function (config, logs, options, manager) {
  this.config = config
  this.logs = logs
  this.manager = manager
  this.update(options)
}

Server.prototype = new events.EventEmitter()

Server.prototype.createServerTitle = function (title) {
  if (this.config.prefix) {
    title = this.config.prefix + title
  }

  if (this.config.suffix) {
    title = title + this.config.suffix
  }

  return title
}

Server.prototype.generateId = function (title) {
  return slugify(title).replace(/\./g, '-')
}

Server.prototype.checkId = function (uid) {
  //if (this.manager.getUsedUIDs(this.config).includes(uid)) {
  //  uid = this.checkId(uid + "_clone")
  //}
  return uid
}

Server.prototype.update = function (options) {
  this.game_selected = options.game_selected || ""
  this.admin_password = options.admin_password
  this.virtual_server = options.virtual_server
  this.auto_start = options.auto_start
  this.battle_eye = options.battle_eye
  this.max_players = options.max_players
  this.missions = options.missions
  this.mods = options.mods || []
  this.password = options.password
  this.port = options.port || 2001
  this.title = options.title
  this.additionalConfigurationOptions = this.parseMissionHeader(options.additionalConfigurationOptions) || {}
  this.id = this.checkId(options.uid) || this.generateId(options.title) || "" 
  this.uid = this.checkId(options.uid) || this.generateId(options.title) || "" 
  this.port = parseInt(this.port, 10) // If port is a string then gamedig fails
  this.parameters = options.parameters
}

Server.prototype.steamQueryPort = function () {
  return this.port + 5
}

Server.prototype.parseMissionHeader = function () {
  return {}
}

Server.prototype.queryStatus = function () {
  if (!this.instance) {
    return
  }
  var self = this
  GameDig.query(
    {
      type: 'armareforger',
      host: '127.0.0.1',
      port: self.steamQueryPort()
    }).then((state) => {
      if (!self.instance) {
        return
      }
      if (state.error) {
        self.state = null
      } else {
        self.state = state
      }
      self.emit('state')
    }).catch((error) => {
      self.state = null
      self.emit('state')
    });
}

Server.prototype.makeServerConfig = function () {
  var scenarioId = '{ECC61978EDCC2B5A}Missions/23_Campaign.conf'

  if (this.missions && this.missions.length > 0) {
    scenarioId = this.missions[0].name
  }

  return {
    bindAddress: '0.0.0.0',
    bindPort: this.port,
    publicAddress: '',
    publicPort: this.port,
    a2s: {
      address: '0.0.0.0',
      port: this.steamQueryPort()
    },
    rcon: {
      address: '0.0.0.0',
      port: this.port+10,
      password: this.admin_password,
      permission: "admin",
      blacklist: [],
      whitelist: []
    },
    game: {
      name: this.createServerTitle(this.title),
      password: this.password,
      passwordAdmin: this.admin_password,
      admins : this.config.admins,
      scenarioId: scenarioId,
      maxPlayers: parseInt(this.max_players, 10),
      visible: true,
      crossPlatform: true,
      supportedPlatforms: [
        "PLATFORM_PC",
        "PLATFORM_XBL"
      ],
      gameProperties: {
        serverMaxViewDistance: 2500,
        serverMinGrassDistance: 50,
        networkViewDistance: 1000,
        disableThirdPerson: true,
        fastValidation: true,
        battlEye: this.battle_eye,
        missionHeader: this.additionalConfigurationOptions
      },
      mods: this.mods
    }
  }
}

Server.prototype.serverConfigDirectory = function () {
  return path.join(this.config.games[this.game_selected].path, "configs")
}

Server.prototype.serverConfigFile = function () {
  return path.join(this.serverConfigDirectory(), this.generateId() + '.json')
}

Server.prototype.saveServerConfig = function (config, cb) {
  var self = this
  fs.mkdirp(self.serverConfigDirectory(), function (err) {
    if (err) {
      return cb(err)
    }

    fs.writeFile(self.serverConfigFile(), JSON.stringify(config), cb)
  })
}

Server.prototype.serverBinary = function () {
  return path.join(this.config.games[this.game_selected].path, this.config.games[this.game_selected].executable)
}

Server.prototype.serverArguments = function () {
  var self = this
  var id = self.generateId()
  return [
    '-config',
    this.serverConfigFile(),
    '-addonsDir',
    this.config.games[this.game_selected].modPath,
    '-addonDownloadDir',
    this.config.games[this.game_selected].modPath,
    '-logsDir',
    path.join(this.config.games[this.game_selected].logPath, id),
    '-profile',
    this.config.games[this.game_selected].path
  ].map(function (argument) {
    return argument
  })
}

Server.prototype.start = function () {
  if (this.instance) {
    return this
  }

  var self = this
  var config = self.makeServerConfig()
  self.saveServerConfig(config, function (err) {
    if (err) {
      console.log(err)
      return
    }
    console.log(self.serverBinary(), self.serverArguments())
    var instance = childProcess.spawn(self.serverBinary(), self.serverArguments(), { cwd: self.config.path })

    instance.on('error', function (err) {
      console.error('Failed to start server', self.title, err)
    })

    instance.on('close', function (code) {
      clearInterval(self.queryStatusInterval)
      self.state = null
      self.pid = null
      self.instance = null

      self.emit('state')
    })

    self.pid = instance.pid
    self.instance = instance
    self.headlessClientInstances = []
    self.queryStatusInterval = setInterval(function () {
      self.queryStatus()
    }, queryInterval)

    self.emit('state')
  })

  return this
}

Server.prototype.stop = function (cb) {
  var handled = false

  var finalHandler = function () {
    if (!handled) {
      handled = true

      if (cb) {
        cb()
      }
    }
  }

  this.instance.on('close', finalHandler)

  this.instance.kill()

  setTimeout(finalHandler, 5000)

  return this
}

Server.prototype.toJSON = function () {
  return {
    game_selected: this.game_selected,
    admin_password: this.admin_password,
    virtual_server: this.virtual_server,
    auto_start: this.auto_start,
    battle_eye: this.battle_eye,
    id: this.id,
    uid: this.uid,
    max_players: this.max_players,
    missions: this.missions,
    mods: this.mods,
    password: this.password,
    pid: this.pid,
    port: this.port,
    state: this.state,
    parameters: this.parameters,
    additionalConfigurationOptions: this.additionalConfigurationOptions,
    title: this.title
  }
}

module.exports = Server