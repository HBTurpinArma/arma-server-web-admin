var _ = require('lodash')
var events = require('events')
var fs = require('fs')
var filesize = require('filesize')
const { GameDig } = require('gamedig'); 
var usage = require('pidusage')
var slugify = require('slugify')

var ArmaServer = require('arma-server')

var virtualServer = require('./virtualServer')
var config = require('../../config.js')
const { param } = require('jquery')

var processesInterval = 2000
var queryInterval = 5000

var createServerTitle = function (title) {
  if (config.prefix) {
    title = config.prefix + title
  }

  if (config.suffix) {
    title = title + config.suffix
  }

  return title
}

var Server = function (config, logs, options, manager) {
  this.config = config
  this.logs = logs
  this.manager = manager
  this.update(options)
}

Server.prototype = new events.EventEmitter()

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
  this.title = options.title
  this.port = options.port || 2302
  this.password = options.password
  this.admin_password = options.admin_password
  this.allowed_file_patching = options.allowed_file_patching
  this.auto_start = options.auto_start
  this.virtual_server = options.virtual_server
  this.battle_eye = options.battle_eye
  this.file_patching = options.file_patching
  this.forcedDifficulty = options.forcedDifficulty || null
  this.max_players = options.max_players
  this.missions = options.missions
  this.mods = options.mods || []
  this.mods_optional = options.mods_optional || []
  this.mods_server_only = options.mods_server_only || []
  this.motd = options.motd || null
  this.number_of_headless_clients = options.number_of_headless_clients || 0
  this.parameters = options.parameters
  this.persistent = options.persistent
  this.von = options.von
  this.verify_signatures = options.verify_signatures
  this.additionalConfigurationOptions = options.additionalConfigurationOptions
  this.cbaConfigurationOptions = options.cbaConfigurationOptions
  this.id = this.checkId(options.uid) || this.generateId(options.title) || "" 
  this.uid = this.checkId(options.uid) || this.generateId(options.title) || "" 
  this.port = parseInt(this.port, 10) // If port is a string then gamedig fails
  this.rcon_port = parseInt(this.port+8, 10)
  this.rcon_password = this.admin_password
}

function processStats (stats) {
  if (!stats) {
    return {
      cpu: 0,
      cpuFormatted: '0%',
      memory: 0,
      memoryFormatted: filesize(0)
    }
  }
  return {
    cpu: stats.cpu,
    cpuFormatted: stats.cpu.toFixed(0) + ' %',
    memory: stats.memory,
    memoryFormatted: filesize(stats.memory)
  }
}

Server.prototype.queryProcesses = function () {
  if (!this.instance) {
    return
  }

  var self = this
  var headlessPids = Object.values(this.headlessClientInstances).map(function (instance) {
    return instance.pid
  })
  var serverPid = self.instance.pid
  var pids = [serverPid].concat(headlessPids)
  usage(pids, function (err, stats) {
    if (!self.instance) {
      return
    }

    if (err) {
      self.processes = null
    } else {
      self.processes = pids.map(function (pid, idx) {
        var pidStats = processStats(stats[pid])
        if (pid === serverPid) {
          pidStats.name = 'Server'
        } else {
          pidStats.name = 'Headless ' + idx // First headless at idx 1
          pidStats.offline = false
          if (!stats[pid]) {
            pidStats.name = 'Headless ' + idx + " (Disconnected)" // First headless at idx 1
            pidStats.offline = true
          }
        }
        return pidStats
      })
    }

    self.emit('state')
  })
}

Server.prototype.queryStatus = function () {
  if (!this.instance) {
    return
  }

  var self = this
  GameDig.query(
    {
      type: config.games[this.game_selected].gamedigQuery,
      host: '127.0.0.1',
      port: self.port
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

Server.prototype.getParameters = function () {
  var parameters = []

  if (config.parameters && Array.isArray(config.parameters)) {
    parameters = parameters.concat(config.parameters)
  }

  if (this.parameters && Array.isArray(this.parameters)) {
    parameters = parameters.concat(this.parameters)
  }

  return parameters
}

Server.prototype.getAdditionalConfigurationOptions = function () {
  var additionalConfigurationOptions = ''

  if (config.additionalConfigurationOptions) {
    additionalConfigurationOptions += config.additionalConfigurationOptions
  }

  if (this.additionalConfigurationOptions) {
    if (additionalConfigurationOptions) {
      additionalConfigurationOptions += '\n'
    }

    additionalConfigurationOptions += this.additionalConfigurationOptions
  }

  return additionalConfigurationOptions
}

Server.prototype.start = function () {
  if (this.instance) {
    return this
  }

  var self = this
  
  if (this.virtual_server) {
    virtualServer.create(config, self)
      .then((serverFolder) => {
        self.virtualServerFolder = serverFolder
        self.realStart(serverFolder)
      })
      .catch((err) => {
        console.error('Error creating virtual server folder:', err)
      })
  } else {
    self.realStart(config.games[this.game_selected].path)
  }
}

Server.prototype.realStart = function (path) {
  if (this.instance) {
    return this
  }

  var parameters = this.getParameters()
  if(this.virtual_server){
    var bepath="-bepath=battleye"
    parameters=parameters.concat([bepath])
    //console.log(parameters)
  }
  
  var server = new ArmaServer.Server({
    additionalConfigurationOptions: this.getAdditionalConfigurationOptions(),
    admins: config.admins,
    allowedFilePatching: this.allowed_file_patching || 1,
    battleEye: this.battle_eye ? 1 : 0,
    config: this.id,
    disableVoN: this.von ? 0 : 1,
    game: this.game_selected,
    filePatching: this.file_patching || false,
    forcedDifficulty: this.forcedDifficulty || null,
    headlessClients: this.number_of_headless_clients > 0 ? ['127.0.0.1'] : null,
    hostname: createServerTitle(this.title),
    localClient: this.number_of_headless_clients > 0 ? ['127.0.0.1'] : null,
    missions: this.missions,
    mods: this.mods,
    motd: (this.motd && this.motd.split('\n')) || null,
    parameters: parameters,
    password: this.password,
    passwordAdmin: this.admin_password || config.admin_password,
    path: path,
    persistent: this.persistent ? 1 : 0,
    platform: this.config.type,
    players: this.max_players,
    port: this.port,
    serverMods: this.mods_server_only,
    verifySignatures: this.verify_signatures ? 2 : 0,
    executable: config.games[this.game_selected].executable || null
  })

  server.writeServerConfig()
  var instance = server.start()
  var self = this

  instance.on('close', function (code) {
    clearInterval(self.queryProcessesInterval)
    clearInterval(self.queryStatusInterval)
    self.state = null
    self.processes = null
    self.pid = null
    self.instance = null

    self.stopHeadlessClients()
      .then(() => {
        if (self.virtualServerFolder) {
          virtualServer.remove(self.virtualServerFolder)
          self.virtualServerFolder = null
        }
        self.emit('state')
      })
  })

  instance.on('error', function (err) {
    console.log(err)
  })

  this.pid = instance.pid
  this.instance = instance

  this.logs.logServerProcess(this.instance, this.id, 'server')
  this.logs.cleanupOldLogFiles()

  this.queryProcessesInterval = setInterval(function () {
    self.queryProcesses()
  }, processesInterval)

  this.queryStatusInterval = setInterval(function () {
    self.queryStatus()
  }, queryInterval)

  this.startHeadlessClients(path)

  this.emit('state')

  return this
}


Server.prototype.restartHeadlessClients = function () {
  if (this.instance) {
    //console.log("RESTART CHECK:", this.instance.headlessInstancesCheck)
    if (this.instance.spawnfile) {
      //console.log("RESTARTING VIRTUAL HCS")
      var spawnLocation = this.instance.spawnfile
      var serverfolder = spawnLocation.substring(0, spawnLocation.lastIndexOf("\\"));
      this.startHeadlessClients(serverfolder)
    } else {
      //console.log("RESTARTING NORMAL HCS")
      this.startHeadlessClients(config.games[this.game_selected].path)
    }
  }
}

Server.prototype.startHeadlessClients = function (path) {
  var parameters = this.getParameters()
  var self = this
  

  if (this.instance.headlessInstancesCheck === undefined){
    this.instance.headlessInstancesCheck = {}
  }

  var headlessClientInstances = _.times(this.number_of_headless_clients, function (i) {
    if (!self.instance.headlessInstancesCheck.hasOwnProperty(i)) {

      //console.log("EXEC:", self.instance.headlessInstancesCheck)
      //console.log("EXEC: HC_"+i)
      //Replace the -name parameter with the correct one
      console.log(parameters)

      //Drop any existing -name and -profiles parameters
      var parameters_headless = parameters.filter(function (param) {
        return !param.startsWith('-name=') && !param.startsWith('-profiles=')
      }).concat([
        '-name=HC_' + (i + 1),
        '-profiles=profiles/HC_' + (i + 1),
      ])

      console.log(parameters_headless)

      var headless = new ArmaServer.Headless({
        filePatching: self.file_patching,
        game: self.game_selected,
        host: '127.0.0.1',
        mods: self.mods.concat(self.mods_server_only),
        parameters: parameters_headless,
        password: self.password,
        path: path,
        platform: self.config.type,
        port: self.port,
        executable: self.config.games[self.game_selected].executable || null
      })
      var headlessInstance = headless.start()

      self.logs.logServerProcess(headlessInstance, self.id, 'HC_' + (i + 1))

      //Add to the instance checker dict
      self.instance.headlessInstancesCheck[i] = headlessInstance.pid

      return headlessInstance

    } else {
      return self.headlessClientInstances[i]
    }
  }).reduce((dict, value, index) => {
    dict[index] = value; 
    return dict;
  }, {});

  //console.log("END",self.instance.headlessInstancesCheck)
  //console.log("BEFORE",self.headlessClientInstances)
  this.headlessClientInstances = headlessClientInstances
  //console.log("AFTER",self.headlessClientInstances)

}

Server.prototype.stop = function (cb) {
  var handled = false

  this.instance.on('close', function (code) {
    if (!handled) {
      handled = true

      if (cb) {
        cb()
      }
    }
  })

  this.instance.kill()

  setTimeout(function () {
    if (!handled) {
      handled = true

      if (cb) {
        cb()
      }
    }
  }, 5000)

  return this
}

Server.prototype.stopHeadlessClients = function () {
  var self = this

  return Promise.all(Object.values(this.headlessClientInstances).map(function (headlessClientInstance) {
    var handled = false
    return new Promise(function (resolve, reject) {
      headlessClientInstance.on('close', function () {
        if (!handled) {
          handled = true
          resolve()
        }
      })

      setTimeout(function () {
        if (!handled) {
          handled = true
          resolve()
        }
      }, 5000)

      headlessClientInstance.kill()
    })
  })).then(function () {
    self.headlessClientInstances = {}
  })
}

Server.prototype.toJSON = function () {
  return {
    game_selected: this.game_selected,
    title: this.title,
    id: this.id,
    uid: this.uid,
    pid: this.pid,
    port: this.port,
    password: this.password,
    admin_password: this.admin_password,
    allowed_file_patching: this.allowed_file_patching,
    auto_start: this.auto_start,
    virtual_server: this.virtual_server,
    battle_eye: this.battle_eye,
    file_patching: this.file_patching,
    forcedDifficulty: this.forcedDifficulty,
    max_players: this.max_players,
    missions: this.missions,
    motd: this.motd,
    mods: this.mods,
    mods_optional: this.mods_optional,
    mods_server_only: this.mods_server_only,
    number_of_headless_clients: this.number_of_headless_clients,
    parameters: this.parameters,
    persistent: this.persistent,
    processes: this.processes,
    state: this.state,
    von: this.von,
    verify_signatures: this.verify_signatures,
    additionalConfigurationOptions: this.additionalConfigurationOptions,
    cbaConfigurationOptions: this.cbaConfigurationOptions
  }
}

module.exports = Server
