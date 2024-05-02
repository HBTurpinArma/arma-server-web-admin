var async = require('async')
var express = require('express')
var multer = require('multer')
var path = require('path')

var upload = multer({ storage: multer.diskStorage({}) })

module.exports = function (missionsManager) {
  var router = express.Router()

  router.get('/', function (req, res) {
    if (!missionsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view missions...')
      return
    }
    res.json(missionsManager.missions)
  })

  router.post('/', upload.array('missions', 64), function (req, res) {
    if (!missionsManager.canUserCreate(req.auth.user)){
      res.status(403).send('You do not have permission to add missions...')
      return
    }
    var missions = req.files.filter(function (file) {
      return path.extname(file.originalname) === '.pbo'
    })
    var gameKey = req.body.game

    async.parallelLimit(
      missions.map(function (missionFile) {
        return function (next) {
          missionsManager.handleUpload(gameKey, missionFile, next)
        }
      }),
      8,
      function (err) {
        if (err) {
          res.status(500).send(err)
        } else {
          res.status(200).json({ success: true })
        }
      }
    )
  })

  router.get('/:mission', function (req, res) {
    if (!missionsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to view missions...')
      return
    }
    var filename = req.params.mission
    var gameKey = "arma3"

    res.download(missionsManager.missionPath(gameKey. filename), decodeURI(filename))
  })

  router.delete('/:mission', function (req, res) {
    if (!missionsManager.canUserDelete(req.auth.user)){
      res.status(403).send('You do not have permission to delete missions...')
      return
    }
    var filename = req.params.mission
    var gameKey = "arma3"
    
    //TODO: hard coded stinky gamekey, need to maybe build the game into the mission model properly so it can be called and referenced in the listitem view.
    missionsManager.delete(gameKey, filename, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.json({ success: true })
      }
    })
  })

  router.post('/refresh', function (req, res) {
    if (!missionsManager.canUserView(req.auth.user)){
      res.status(403).send('You do not have permission to refresh missions...')
      return
    }
    missionsManager.updateMissions()
    res.status(204).send()
  })

  router.post('/workshop', function (req, res) {
    if (!missionsManager.canUserCreate(req.auth.user)){
      res.status(403).send('You do not have permission to add missions...')
      return
    }
    var id = req.body.id

    missionsManager.downloadSteamWorkshop(id, function (err) {
      if (err) {
        res.status(500).send(err)
      } else {
        res.json({ success: true })
      }
    })
  })

  return router
}
