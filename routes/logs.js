var express = require('express')

module.exports = function (logsManager, debriefing) {
  var router = express.Router()

  router.get('/', function (req, res) {
    logsManager.logFiles(function (err, files) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.json(files)
      }
    })
  })

  router.delete('/:source/:log', function (req, res) {
    logsManager.delete(req.params.log, req.params.source, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.status(204).send()
      }
    })
  })

  router.delete('/:log', function (req, res) {
    var filename = req.params.log
    logsManager.delete(filename, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.status(204).send()
      }
    })
  })

  router.get('/:source/:log/leaderboard', function (req, res) {
    if (req.params.source !== 'taw' || !req.params.log.toLowerCase().endsWith('.json')) {
      return res.status(400).send('A TAW JSON log is required')
    }
    if (!debriefing) return res.status(500).send('Leaderboard generator is not configured')

    logsManager.getLogFile(req.params.log, 'taw', function (err, file) {
      if (err) return res.status(500).send(err)
      if (!file) return res.status(404).send('File not found')

      debriefing.generate(file.path, function (err, image) {
        if (err) return res.status(500).send(err.message)
        res.download(image.path, image.filename, function (err) {
          image.cleanup()
          if (err && !res.headersSent) res.status(500).send(err.message)
        })
      })
    })
  })

  router.get('/:source/:log/:mode', function (req, res) {
    getLog(req, res, req.params.source)
  })

  router.get('/:log/:mode', function (req, res) {
    getLog(req, res, 'primary')
  })

  function getLog (req, res, source) {
    var requestedFilename = req.params.log
    var mode = req.params.mode === 'view' ? 'view' : 'download'
    logsManager.getLogFile(requestedFilename, source, function (err, file) {
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
  }

  return router
}
