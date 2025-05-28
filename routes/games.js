var express = require('express')

module.exports = function (gamesConfig) {
  var router = express.Router()
  let cachedGamesData = null

  router.get('/', function (req, res) {
    if (cachedGamesData) {
      // Serve cached data
      return res.json(cachedGamesData)
    }

    // Cache the gamesConfig data
    cachedGamesData = gamesConfig
    res.json(cachedGamesData)
  })

  return router
}