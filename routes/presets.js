var express = require('express')
var fs = require('fs')
var path = require('path')

module.exports = function (presetsPath) {
  var router = express.Router()

  function isValidName (name) {
    return name === path.basename(name) && path.extname(name).toLowerCase() === '.html'
  }

  router.get('/', function (req, res) {
    fs.readdir(presetsPath, { withFileTypes: true }, function (err, entries) {
      if (err) {
        console.error('Presets: cannot read ' + presetsPath + ': ' + err.message)
        res.status(500).send('Unable to read presets folder (' + err.code + ')')
        return
      }
      var files = entries
        .filter(function (e) { return e.isFile() && isValidName(e.name) })
        .map(function (e) { return e.name })
        .sort()
      res.json(files)
    })
  })

  router.get('/sets', function (req, res) {
    var dir = path.join(presetsPath, 'sets')
    fs.promises.readdir(dir).then(function (files) {
      return Promise.all(files.filter(function (f) { return path.extname(f).toLowerCase() === '.json' }).map(function (f) {
        return fs.promises.readFile(path.join(dir, f), 'utf8').then(function (text) {
          var set = JSON.parse(text)
          return { name: set.name || path.basename(f, path.extname(f)), entries: set.entries }
        }).catch(function () { return null })
      }))
    }).then(function (sets) {
      var result = {}
      sets.forEach(function (s) {
        if (s && Array.isArray(s.entries)) result[s.name] = s.entries
      })
      res.json(result)
    }).catch(function () { res.json({}) })
  })

  router.get('/:file', function (req, res) {
    var name = req.params.file
    if (!isValidName(name)) {
      res.status(400).send('Invalid preset name')
      return
    }
    res.sendFile(name, { root: presetsPath, dotfiles: 'deny' }, function (err) {
      if (err && !res.headersSent) {
        res.status(err.status === 404 ? 404 : 500).send('Preset not found')
      }
    })
  })

  return router
}
