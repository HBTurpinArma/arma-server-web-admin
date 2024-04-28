var async = require('async')
var express = require('express')
var multer = require('multer')
var path = require('path')
const { config } = require('process')

var upload = multer({ storage: multer.diskStorage({}) })

module.exports = function (games) {
  var router = express.Router()

  router.get('/', function (req, res) {
    res.json(games)
  })

  return router
}
