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

Logs.prototype.canUserView = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.logs.view || false
}

Logs.prototype.canUserDelete = function(user ){
  return this.config.auth.find(u => u.username == user).permissions.logs.delete || false
}

Logs.prototype.delete = function (filename, callback) {
  callback = callback || function () {}

  this.getLogFile(filename, function (err, logFile) {
    if (err) {
      return callback(err)
    } else {
      if (logFile && logFile.path) {
        fs.unlink(logFile.path, callback)
      } else {
        return callback(new Error('File not found'))
      }
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

Logs.prototype.logFiles = function (callback) {
  var directory = this.logsPath()

  if (directory === null) {
    return callback(null, [])
  }

  fs.readdir(directory, function (err, files) {
    if (err) {
      callback(err)
      return
    }

    files = files.filter(function (file) {
      return file.endsWith('.rpt') || file.endsWith('.log') // Include .log files for console output
    }).map(function (file) {

      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);

      return {
        name: file,
        path: filePath,
        formattedSize: filesize(stats.size), // File size in bytes
        size: stats.size, // File size in bytes
        created: stats.birthtime.toISOString(), // Creation time
        modified: stats.mtime.toISOString() // Last modified time
      }
    });


    files.sort(function (a, b) {
      return b.created.localeCompare(a.created) // Descending order
    })

    callback(null, files);
  })
}

Logs.prototype.getLogFile = function (filename, callback) {
  this.logFiles(function (err, files) {
    if (err) {
      callback(err)
    } else {
      var validLogs = files.filter(function (file) {
        return file.name === filename
      })

      if (validLogs.length > 0) {
        callback(null, validLogs[0])
      } else {
        callback(null, null)
      }
    }
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

    var oldLogFiles = files.slice(numberOfLogsToKeep)
    oldLogFiles.forEach(function (logFile) {
      self.delete(logFile.name)
    })
  })
}

module.exports = Logs