var childProcess = require('child_process')
var fs = require('fs')
var os = require('os')
var path = require('path')

module.exports = function (settings) {
  settings = settings || {}

  return {
    generate: function (jsonPath, callback) {
      if (typeof settings.python !== 'string' || !settings.python ||
          typeof settings.script !== 'string' || !settings.script) {
        return callback(new Error('Leaderboard generator is not configured'))
      }

      var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-leaderboard-'))
      var basename = path.parse(jsonPath).name + '-leaderboard.png'
      var outputPath = path.join(directory, basename)
      var child = childProcess.spawn(settings.python, [settings.script, '--input', jsonPath, '--output', outputPath], {
        cwd: path.dirname(settings.script),
        windowsHide: true
      })
      var stderr = ''
      var finished = false
      var timeout = setTimeout(function () {
        child.kill()
      }, settings.timeoutMs || 120000)

      function cleanup () {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch (error) {}
        try { fs.rmdirSync(directory) } catch (error) {}
      }

      function complete (err) {
        if (finished) return
        finished = true
        clearTimeout(timeout)
        if (err) {
          cleanup()
          return callback(err)
        }
        if (!fs.existsSync(outputPath)) {
          cleanup()
          return callback(new Error('Leaderboard generator did not create an image'))
        }
        callback(null, { path: outputPath, filename: basename, cleanup: cleanup })
      }

      child.stderr.on('data', function (data) {
        stderr = (stderr + data.toString()).slice(-8000)
      })
      child.on('error', complete)
      child.on('close', function (code, signal) {
        if (code !== 0) {
          return complete(new Error(stderr.trim() || 'Leaderboard generation failed (' + (signal || code) + ')'))
        }
        complete(null)
      })
    }
  }
}
