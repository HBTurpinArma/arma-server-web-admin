var express = require('express')
var fs = require('fs')
var path = require('path')

var MAX_ENTRIES = 500

module.exports = function (config) {
  var router = express.Router()
  var setsDir = path.join(config.presetsPath, 'sets')

  function canEdit (username) {
    var user = (config.auth || []).find(function (u) { return u.username === username })
    return !!(user && user.permissions && user.permissions.presets && user.permissions.presets.edit)
  }

  router.post('/', function (req, res) {
    if (!config.auth || !req.auth || !canEdit(req.auth.user)) {
      res.status(403).send('You do not have permission to edit preset sets...')
      return
    }

    var name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : ''
    var entries = req.body && req.body.entries
    var fileName = name.replace(/[^\w\- ]+/g, '_').trim()
    if (!name || name.length > 80 || !fileName) {
      res.status(400).send('Invalid set name')
      return
    }
    if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES ||
        !entries.every(function (e) { return typeof e === 'string' && e.length > 0 && e.length <= 200 })) {
      res.status(400).send('Invalid set entries')
      return
    }

    var target = path.join(setsDir, fileName + '.json')
    var tmp = target + '.tmp'
    fs.promises.mkdir(setsDir, { recursive: true })
      .then(function () { return fs.promises.writeFile(tmp, JSON.stringify({ name: name, entries: entries }, null, 2), 'utf8') })
      .then(function () { return fs.promises.rename(tmp, target) })
      .then(function () { res.json({ success: true }) })
      .catch(function (err) { res.status(500).send('Unable to save set: ' + err.code) })
  })

  return router
}
