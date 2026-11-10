var express = require('express')
var canUpdateGame = require('../lib/game-update-permission')

module.exports = function (config, updater) {
  var router = express.Router()

  router.use(function (req, res, next) {
    res.set('Cache-Control', 'no-store')
    var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
      return item.username === req.auth.user
    })
    var mods = user && user.permissions && user.permissions.mods
    req.updaterPermissions = { mods: !!(mods && mods.update === true), game: canUpdateGame(user) }
    if (!req.updaterPermissions.mods && !req.updaterPermissions.game) {
      return res.status(403).send('Requires an updater permission and an authenticated account.')
    }
    next()
  })

  router.get('/', function (req, res) {
    var state = updater.snapshot()
    if (state.type && !req.updaterPermissions[state.type]) {
      state.output = ''
      state.truncated = false
      state.outputRestricted = true
    }
    res.json(state)
  })

  function start (req, res, type) {
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.status(403).send('Invalid request')
    if (!req.updaterPermissions[type]) return res.status(403).send('You do not have permission to run this updater.')
    var result = updater.start(type)
    if (result.error) return res.status(result.status).send(result.error)
    res.status(result.status).json(updater.snapshot())
  }

  router.post('/', function (req, res) {
    start(req, res, 'mods')
  })

  router.post('/game', function (req, res) {
    start(req, res, 'game')
  })

  return router
}
