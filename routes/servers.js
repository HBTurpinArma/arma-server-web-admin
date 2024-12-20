var express = require('express')

module.exports = function (manager, mods) {
  var router = express.Router()

  router.get('/', function (req, res) {
    if (!manager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view servers...')
      return
    }
    res.json(manager.getServers())
  })

  router.post('/', function (req, res) {
    if (!manager.canUserCreate(req.auth.user)){
      res.status(403).send('You do not have permission to create servers...')
      return
    }
    if (!req.body.title) {
      res.status(400).send('Server title cannot be empty')
      return
    }

    var server = manager.addServer(req.body)
    res.json(server)
  })

  router.get('/:server', function (req, res) {
    if (!manager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view servers...')
      return
    }
    var server = manager.getServer(req.params.server)
    res.json(server)
  })

  router.put('/:server', function (req, res) {
    if (!manager.canUserEdit(req.auth.user)){
      res.status(403).send('You do not have permission to edit servers...')
      return
    }
    if (!req.body.title) {
      res.status(400).send('Server title cannot be empty')
      return
    }

    var server = manager.getServer(req.params.server)
    server.update(req.body)
    manager.save()
    res.json(server)
  })

  router.delete('/:server', function (req, res) {
    if (!manager.canUserDelete(req.auth.user)){
      res.status(403).send('You do not have permission to delete servers...')
      return
    }
    var server = manager.removeServer(req.params.server)
    res.json(server)
  })

  router.post('/:server/delete', function (req, res) {
    if (!manager.canUserDelete(req.auth.user)){
      res.status(403).send('You do not have permission to delete servers...')
      return
    }
    var server = manager.removeServer(req.params.server)
    res.json(server)
  })

  router.post('/:server/start', function (req, res) {
    if (!manager.canUserStart(req.auth.user)){
      res.status(403).send('You do not have permission to start servers...')
      return
    }
    var server = manager.getServer(req.params.server)
    server.start()
    res.json({ status: 'ok', pid: server.pid })
  })

  router.post('/:server/headlessrefresh', function (req, res) {
    if (!manager.canUserStart(req.auth.user)){
      res.status(403).send('You do not have permission to start servers...')
      return
    }
    var server = manager.getServer(req.params.server)
    server.restartHeadlessClients()
    res.json({ status: 'ok', pid: server.pid })
  })



  router.post('/:server/stop', function (req, res) {
    if (!manager.canUserStop(req.auth.user)){
      res.status(403).send('You do not have permission to stop servers...')
      return
    }
    var server = manager.getServer(req.params.server)
    server.stop(function () {
      if (!server.pid) {
        res.json({ status: true, pid: server.pid })
      } else {
        res.json({ status: false, pid: server.pid })
      }
    })
  })

  return router
}
