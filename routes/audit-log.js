var express = require('express')
var canViewAuditLog = require('../lib/audit-permission')

module.exports = function (config, audit) {
  var router = express.Router()

  router.get('/', function (req, res) {
    res.set('Cache-Control', 'no-store')
    var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
      return item.username === req.auth.user
    })
    if (!canViewAuditLog(user)) {
      return res.status(403).send('You do not have permission to view the panel audit log.')
    }
    var cursor
    if (req.query.cursor !== undefined) {
      if (typeof req.query.cursor !== 'string' || !/^\d+$/.test(req.query.cursor)) {
        return res.status(400).send('Invalid audit log cursor.')
      }
      cursor = Number(req.query.cursor)
    }
    var filters = {}
    for (var i = 0; i < 2; i++) {
      var name = ['user', 'action'][i]
      if (req.query[name] !== undefined) {
        if (typeof req.query[name] !== 'string' || req.query[name].length > 200) {
          return res.status(400).send('Invalid audit log filter.')
        }
        filters[name] = req.query[name].trim()
      }
    }
    try {
      res.json(audit.read(cursor, filters))
    } catch (err) {
      if (err.code === 'INVALID_CURSOR') return res.status(400).send('Invalid audit log cursor.')
      console.error('Unable to read panel audit log:', err)
      res.status(500).send('Unable to read panel audit log.')
    }
  })

  return router
}
