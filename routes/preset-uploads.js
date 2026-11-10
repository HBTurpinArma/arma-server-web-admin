var express = require('express')
var fs = require('fs')
var path = require('path')
var crypto = require('crypto')
var multer = require('multer')
var hasPresetPermission = require('../lib/preset-permissions')

var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('preset')

module.exports = function (config) {
  var router = express.Router()

  router.post('/', function (req, res) {
    if (!hasPresetPermission(config, req, 'edit')) {
      return res.status(403).send('You do not have permission to upload presets.')
    }
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.status(403).send('Invalid request.')
    upload(req, res, function (err) {
      if (err) {
        if (err instanceof multer.MulterError) return res.status(400).send('Invalid upload: ' + err.message)
        console.error('Unable to receive preset:', err)
        return res.status(500).send('Unable to receive preset.')
      }
      if (!req.file) return res.status(400).send('Choose a preset file.')
      var name = req.file.originalname
      if (!name || name.length > 200 || name.charAt(0) === '.' ||
          /[<>:"/\\|?*]/.test(name) ||
          name.split('').some(function (character) { return character.charCodeAt(0) < 32 }) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
          path.extname(name).toLowerCase() !== '.html') {
        return res.status(400).send('Choose a valid .html preset filename.')
      }
      if (!req.file.size) return res.status(400).send('Preset file cannot be empty.')
      fs.readdir(config.presetsPath, function (readErr, names) {
        if (readErr) {
          console.error('Unable to read presets folder:', readErr)
          return res.status(500).send('Unable to read presets folder.')
        }
        var matches = names.filter(function (existing) { return existing.toLowerCase() === name.toLowerCase() })
        if (matches.indexOf(name) === -1 && matches.length > 1) {
          return res.status(409).send('Multiple presets match this filename. Choose an exact filename.')
        }
        var target = matches.indexOf(name) !== -1 ? name : (matches[0] || name)
        var temp = path.join(config.presetsPath, '.' + crypto.randomBytes(16).toString('hex') + '.upload')
        fs.writeFile(temp, req.file.buffer, { flag: 'wx', mode: 0o600 }, function (writeErr) {
          if (writeErr) {
            console.error('Unable to write preset:', writeErr)
            res.status(500).send('Unable to save preset.')
            return
          }
          fs.rename(temp, path.join(config.presetsPath, target), function (renameErr) {
            if (!renameErr) return res.json({ success: true, name: target })
            fs.unlink(temp, function (cleanupErr) {
              if (cleanupErr) console.error('Unable to remove temporary preset:', cleanupErr)
              console.error('Unable to replace preset:', renameErr)
              res.status(500).send('Unable to save preset.')
            })
          })
        })
      })
    })
  })

  router.delete('/:name', function (req, res) {
    if (!hasPresetPermission(config, req, 'delete')) {
      return res.status(403).send('You do not have permission to delete presets.')
    }
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.status(403).send('Invalid request.')
    var name = req.params.name
    if (!name || name === '.' || name === '..' || /[/\\]/.test(name) ||
        path.basename(name) !== name || path.extname(name).toLowerCase() !== '.html') {
      return res.status(400).send('Invalid preset name.')
    }
    var target = path.join(config.presetsPath, name)
    fs.lstat(target, function (statErr, stat) {
      if (statErr) {
        if (statErr.code === 'ENOENT') return res.status(404).send('Preset not found.')
        console.error('Unable to inspect preset:', statErr)
        return res.status(500).send('Unable to delete preset.')
      }
      if (!stat.isFile()) return res.status(400).send('Preset is not a regular file.')
      fs.unlink(target, function (err) {
        if (!err) return res.json({ success: true })
        if (err.code === 'ENOENT') return res.status(404).send('Preset not found.')
        console.error('Unable to delete preset:', err)
        res.status(500).send('Unable to delete preset.')
      })
    })
  })

  return router
}
