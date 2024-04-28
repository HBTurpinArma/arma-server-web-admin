var express = require('express')

module.exports = function (modsManager) {
  var router = express.Router()

  router.get('/', function (req, res) {
    if (!modsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view mods...')
      res.send("No")
      return
    }
    res.send(modsManager.mods)
  })

  router.delete('/:mod', function (req, res) {
    if (!modsManager.canUserDelete(req.auth.user)){
      res.status(403).send('You do not have permission to delete mods...')
      return
    }
    modsManager.delete(req.params.mod, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.status(204).send()
      }
    })
  })

  router.post('/refresh', function (req, res) {
    if (!modsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to refresh mods...')
      return
    }
    modsManager.updateMods()
    res.status(204).send()
  })

  return router
}
