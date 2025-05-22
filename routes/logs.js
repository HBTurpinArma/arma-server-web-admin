var express = require('express')
const config = require('../config');

module.exports = function (logsManager) {
  var router = express.Router()

  router.get('/', function (req, res) {
    if (!logsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view logs...')
      return
    }
    logsManager.logFiles(function (err, files) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.json(files)
      }
    })
  })

  router.delete('/:log', function (req, res) {
    if (!logsManager.canUserDelete(req.auth.user)){
      res.status(403).send('You do not have permission to delete logs...')
      return
    }
    var filename = req.params.log
    logsManager.delete(filename, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.status(204).send()
      }
    })
  })

  router.get('/:log/:mode', function (req, res) {
    if (!logsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view logs...')
      res.send("No")
      return
    }
    var requestedFilename = req.params.log
    var mode = req.params.mode === 'view' ? 'view' : 'download'
    logsManager.getLogFile(requestedFilename, function (err, file) {
      if (err) {
        res.status(500).send(err)
      } else {
        if (file) {
          if (mode === 'download') {
            res.download(file.path)
          } else {
            logsManager.readLogFile(file.path, function (err, data) {
              if (err) {
                return res.status(500).send(err)
              }
              res.contentType('text/plain')
              res.send(data)
            })
          }
        } else {
          res.status(404).send(new Error('File not found'))
        }
      }
    })
  })

  return router
}
