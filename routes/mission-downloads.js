var express = require('express')
var fs = require('fs')
var path = require('path')

module.exports = function (config) {
  var router = express.Router()

  router.get('/:mission/:game?', function (req, res) {
    var filename = req.params.mission
    var gameKey = req.params.game || 'arma3'
    var games = config.games || {}
    var game = Object.prototype.hasOwnProperty.call(games, gameKey) && games[gameKey]

    if (!game || !game.missionPath) return res.status(404).send('Game not found')
    if (filename !== path.basename(filename) || /[\\/:*?"<>|]/.test(filename) ||
        filename.split('').some(function (char) { return char.charCodeAt(0) < 32 }) ||
        filename.charAt(0) === '.' || path.extname(filename).toLowerCase() !== '.pbo') {
      return res.status(400).send('Invalid mission filename')
    }

    var filePath = path.resolve(game.missionPath, filename)
    fs.lstat(filePath, function (err, stat) {
      if (err) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return res.status(404).send('Mission not found')
        console.error('Unable to access mission file:', err)
        return res.status(500).send('Unable to access mission file')
      }
      if (!stat.isFile()) return res.status(404).send('Mission not found')
      res.download(filePath, filename, function (downloadErr) {
        if (!downloadErr) return
        if (downloadErr.code === 'ENOENT' && !res.headersSent) return res.status(404).send('Mission not found')
        console.error('Unable to download mission file:', downloadErr)
        if (res.headersSent) return res.destroy(downloadErr)
        res.status(500).send('Unable to download mission file')
      })
    })
  })

  return router
}
