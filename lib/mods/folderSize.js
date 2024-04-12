var async = require('async')
var fs = require('fs')
var glob = require('glob')
var path = require('path')

module.exports = function (modPath, config, gameKey, callback) {
  var basePath = path.resolve(config.games[gameKey].modPath, modPath)
  var total = 0
  glob('**/*', { cwd: basePath, dot: true }, function (err, files) {
    if (err) {
      return callback(err, 0)
    }

    async.forEach(files, function (file, cb) {
      fs.stat(path.join(basePath, file), function stat (err, stats) {
        if (!err && (stats.isFile() || stats.isSymbolicLink())) {
          var size = stats.size || 0
          total += size
        }
        cb()
      })
    }, function (err) {
      callback(err, total)
    })
  })
}
