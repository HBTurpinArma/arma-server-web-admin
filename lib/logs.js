var async = require('async')
var fs = require('fs.extra')
var filesize = require('filesize')
var path = require('path')
var userhome = require('userhome')

var gamesLogFolder = {
  arma1: 'ArmA',
  arma2: 'ArmA 2',
  arma2oa: 'ArmA 2 OA',
  arma3: 'Arma 3',
  arma3_x64: 'Arma 3',
  armareforger: 'Reforger'
}

var Logs = function (config) {
  this.config = config

  if (this.config.type === 'linux') {
    fs.mkdirp(this.logsPath())
  }
}

Logs.prototype.canUserView = function(user) {
  return this.config.auth.find(u => u.username == user).permissions.logs.view || false
}

Logs.prototype.canUserDelete = function(user ){
  return this.config.auth.find(u => u.username == user).permissions.logs.delete || false
}


Logs.generateLogFileName = function () {
  var dateStr = new Date().toISOString()
    .replace(/:/g, '-') // Replace time dividers with dash
    .replace(/T/, '_') // Remove date and time divider
    .replace(/\..+/, '') // Remove milliseconds
  return 'arma3server_' + dateStr + '.log'
}

Logs.prototype.delete = function (filename, callback) {
  this.getLogFile(filename, function (err, logFile) {
    if (err) {
      if (callback) {
        return callback(err)
      }
    } else {
      if (logFile && logFile.path) {
        fs.unlink(logFile.path, callback)
      } else {
        if (callback) {
          return callback(new Error('File not found'))
        }
      }
    }
  })
}

Logs.prototype.generateLogFilePath = function () {
  return path.join(this.logsPath(), Logs.generateLogFileName())
}

Logs.prototype.logsPath = function () {
  //TODO: Can we link this to the current games logs path in the future, for now lets just choose a folder.....
  if (this.config.type === 'linux') {
    return path.join(this.config.logs)
  }

  if (this.config.type === 'windows') {
    //return userhome('AppData', 'Local', gameLogFolder)
    return path.join(this.config.logs)

  }

  if (this.config.type === 'wine') {
    var username = process.env.USER
    return userhome('.wine', 'drive_c', 'users', username, 'Local Settings', 'Application Data', gameLogFolder)
  }

  return null
}

Logs.prototype.logFiles = function (page, pageSize, callback) {
  if (!page) {
    page = 0;
  }
  if (!pageSize) {
    pageSize = Infinity;
  }

  var directory = this.logsPath()

  if (directory === null) {
    return callback(null, [])
  }

  fs.readdir(directory, function (err, files) {
    if (err) {
      callback(err)
      return
    }

    files = files.map(function (file) {
      return {
        name: file,
        path: path.join(directory, file)
      }
    })

    async.filter(files, function (file, cb) {
      fs.stat(file.path, function (err, stat) {
        file.formattedSize = filesize(stat.size)
        file.size = stat.size
        file.formattedDate = stat.mtime.toISOString().replace(/T/, ' ').replace(/\..+/, '')
        file.date = stat.mtime
        cb(!err && stat.isFile())
      })
    }, function (files) {
      files = files.sort(function (a, b) {
        const toDate = (fileName) => {
          const dateFormat = 'yyyy-mm-dd'
          const timeFormat = 'hh-mm-ss'
          const substring = fileName.slice(-1 * `${dateFormat}_${timeFormat}.rpt`.length)
          const date = substring.slice(0, dateFormat.length)
          const time = substring.slice(`${dateFormat}_`.length, -1 * '.rpt'.length).replace(/\-/g, ':')
          return new Date(`${date}T${time}Z`)
        };

        const timeDifference = toDate(b.name).getTime() - toDate(a.name).getTime()
        const dictionaryDifference = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        return timeDifference === 0 ? dictionaryDifference : timeDifference
      })
      if (pageSize !== Infinity) { 
        files = files.slice(pageSize * page, pageSize)
      }

      callback(null, files)
    })
  })
}

Logs.prototype.getLogFile = function (filename, callback) {
  this.logFiles(0, Infinity, function (err, files) {
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

module.exports = Logs
