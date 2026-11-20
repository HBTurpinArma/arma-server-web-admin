var async = require('async')
var fs = require('fs.extra')
var filesize = require('filesize')
var path = require('path')
var userhome = require('userhome')

var numberOfLogsToKeep = 100
var Logs = function (config) {
  this.config = config

  if (this.config.type === 'linux') {
    fs.mkdirp(this.logsPath())
  }
}

Logs.generateLogFileName = function (prefix, suffix) {
  var dateStr = new Date().toISOString()
    .replace(/:/g, '-') // Replace time dividers with dash
    .replace(/T/, '_') // Remove date and time divider
    .replace(/\..+/, '') // Remove milliseconds
  return prefix + '_' + dateStr + '_' + suffix + '.rpt'
}

Logs.prototype.canUserView = function (user) {
  return this.config.auth.find(u => u.username === user).permissions.logs.view || false
}

Logs.prototype.canUserDelete = function (user) {
  return this.config.auth.find(u => u.username === user).permissions.logs.delete || false
}

Logs.prototype.delete = function (filename, source, callback) {
  if (typeof source === 'function') {
    callback = source
    source = 'primary'
  }
  callback = callback || function () {}

  var self = this
  if (source === 'taw') {
    this.filesInDirectory(this.tawLogsPath(), source, ['.log', '.json'], function (err, files) {
      if (err) return callback(err)

      var matches = files.filter(function (file) {
        return file.name === filename || path.parse(file.name).name === filename
      })
      if (matches.length === 0) return callback(new Error('File not found'))
      async.each(matches, function (file, done) {
        fs.unlink(file.path, done)
      }, callback)
    })
    return
  }

  self.getLogFile(filename, source, function (err, logFile) {
    if (err) {
      return callback(err)
    } else if (logFile && logFile.path) {
      fs.unlink(logFile.path, callback)
    } else {
      return callback(new Error('File not found'))
    }
  })
}

Logs.prototype.generateLogFilePath = function (prefix, suffix) {
  return path.join(this.logsPath(), Logs.generateLogFileName(prefix, suffix))
}

Logs.prototype.logsPath = function () {
  if (this.config.type === 'linux') {
    return path.join(this.config.logsPath)
  }

  if (this.config.type === 'windows') {
    return path.join(this.config.logsPath)
  }

  if (this.config.type === 'wine') { // idk what to do with wine, this is very hacky atm to fix my issues
    var username = process.env.USER
    return userhome('.wine', 'drive_c', 'users', username, 'Local Settings', 'Application Data', 'arma-server-web-admin', 'logs')
  }

  return null
}

Logs.prototype.tawLogsPath = function () {
  return path.join(this.config.tawLogsPath || path.join(this.logsPath(), 'taw_logging'))
}

Logs.prototype.sourcePath = function (source) {
  if (source === 'primary') return this.logsPath()
  if (source === 'taw') return this.tawLogsPath()
  return null
}

Logs.prototype.filesInDirectory = function (directory, source, extensions, callback) {
  fs.readdir(directory, function (err, files) {
    if (err) {
      if (err.code === 'ENOENT' && source === 'taw') return callback(null, [])
      return callback(err)
    }

    var logFiles = files.filter(function (file) {
      return extensions.some(function (extension) {
        return file.toLowerCase().endsWith(extension)
      })
    }).map(function (file) {
      var filePath = path.join(directory, file)
      var stats = fs.statSync(filePath)
      if (!stats.isFile()) return null

      return {
        id: source === 'primary' ? file : source + '/' + file,
        source: source,
        name: file,
        path: filePath,
        formattedSize: filesize(stats.size),
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString()
      }
    }).filter(function (file) {
      return file !== null
    })

    callback(null, logFiles)
  })
}

Logs.prototype.readTawMetadata = function (filePath) {
  try {
    var data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    var mission = data._mission || {}
    var playerCount = Object.keys(data).filter(function (id) {
      if (id === '_mission') return false
      var player = data[id]
      if (!player || typeof player !== 'object') return false
      var name = player.meta && player.meta.playerName
      return !(/^HC\d*$/i.test(id) || /headlessclient/i.test(name || ''))
    }).length

    return {
      missionName: mission.missionName || mission.briefingName || '',
      playerCount: playerCount
    }
  } catch (error) {
    return { missionName: '', playerCount: null }
  }
}

Logs.prototype.groupTawFiles = function (files) {
  var self = this
  var groups = {}

  files.forEach(function (file) {
    var stem = path.parse(file.name).name
    var group = groups[stem]
    if (!group) {
      group = groups[stem] = {
        id: 'taw/' + stem,
        source: 'taw',
        name: stem,
        files: [],
        size: 0,
        created: file.created,
        modified: file.modified
      }
    }
    group.files.push({ name: file.name, size: file.size })
    if (path.extname(file.name).toLowerCase() === '.json') {
      var metadata = self.readTawMetadata(file.path)
      group.missionName = metadata.missionName
      group.playerCount = metadata.playerCount
    }
    group.size += file.size
    if (file.created < group.created) group.created = file.created
    if (file.modified > group.modified) group.modified = file.modified
  })

  return Object.keys(groups).map(function (stem) {
    var group = groups[stem]
    group.files.sort(function (a, b) {
      return a.name.localeCompare(b.name)
    })
    group.formattedSize = filesize(group.size)
    return group
  })
}

Logs.prototype.logFiles = function (callback) {
  var self = this
  var directory = this.logsPath()

  if (directory === null) return callback(null, [])

  async.parallel({
    primary: function (done) {
      self.filesInDirectory(directory, 'primary', ['.rpt', '.log'], done)
    },
    taw: function (done) {
      self.filesInDirectory(self.tawLogsPath(), 'taw', ['.log', '.json'], done)
    }
  }, function (err, files) {
    if (err) return callback(err)

    var combined = files.primary.concat(self.groupTawFiles(files.taw))
    combined.sort(function (a, b) {
      return b.created.localeCompare(a.created)
    })
    callback(null, combined)
  })
}

Logs.prototype.getLogFile = function (filename, source, callback) {
  if (typeof source === 'function') {
    callback = source
    source = 'primary'
  }
  var directory = this.sourcePath(source)
  if (!directory) return callback(null, null)

  this.filesInDirectory(directory, source, source === 'taw' ? ['.log', '.json'] : ['.rpt', '.log'], function (err, files) {
    if (err) return callback(err)

    var validLogs = files.filter(function (file) {
      return file.name === filename
    })
    callback(null, validLogs.length > 0 ? validLogs[0] : null)
  })
}

Logs.prototype.readLogFile = function (filename, callback) {
  fs.readFile(filename, callback)
}

Logs.prototype.logServerProcess = function (serverProcess, prefix, suffix) {
  if (this.config.type !== 'linux') {
    return
  }

  var logStream = fs.createWriteStream(this.generateLogFilePath(prefix, suffix), {
    flags: 'a'
  })

  serverProcess.stdout.on('data', function (data) {
    if (logStream) {
      logStream.write(data)
    }
  })

  serverProcess.stderr.on('data', function (data) {
    if (logStream) {
      logStream.write(data)
    }
  })

  serverProcess.on('close', function (code) {
    if (logStream) {
      logStream.end()
      logStream = undefined
    }
  })

  serverProcess.on('error', function (err) {
    if (logStream && err) {
      logStream.write(err.toString())
    }
  })
}

Logs.prototype.cleanupOldLogFiles = function () {
  if (this.config.type !== 'linux') {
    return
  }

  var self = this

  self.logFiles(function (err, files) {
    if (err) {
      return
    }

    var oldLogFiles = files.filter(function (logFile) {
      return logFile.source === 'primary'
    }).slice(numberOfLogsToKeep)
    oldLogFiles.forEach(function (logFile) {
      self.delete(logFile.name, 'primary')
    })
  })
}

module.exports = Logs
