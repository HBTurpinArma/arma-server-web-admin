var childProcess = require('child_process')
var path = require('path')
var StringDecoder = require('string_decoder').StringDecoder

var MAX_OUTPUT = 256 * 1024

module.exports = function (settings, onSuccess) {
  var job = null

  function snapshot () {
    return {
      configured: !!settings,
      gameConfigured: !!(settings && settings.gameScript),
      running: !!(job && job.running),
      status: job ? job.status : 'idle',
      type: job ? job.type : null,
      output: job ? job.output : '',
      truncated: !!(job && job.truncated)
    }
  }

  function start (type) {
    type = type || 'mods'
    if (type !== 'mods' && type !== 'game') return { error: 'Invalid update type.', status: 400 }
    if (!settings) return { error: 'Mod updater is not configured.', status: 503 }
    if (job && job.running) return { error: 'An update is already running.', status: 409 }
    var script = type === 'game' ? settings.gameScript : settings.script
    var cwd = type === 'game' ? settings.gameCwd : settings.cwd
    if (!script) return { error: type === 'game' ? 'Game updater is not configured.' : 'Mod updater is not configured.', status: 503 }
    if (typeof settings.python !== 'string' || !settings.python ||
        typeof script !== 'string' || !path.isAbsolute(script) ||
        (cwd !== undefined && (typeof cwd !== 'string' || !path.isAbsolute(cwd)))) {
      return { error: 'Invalid updater configuration. Check python, script and working directory.', status: 500 }
    }

    job = { type: type, running: true, status: 'running', output: '', truncated: false }
    var current = job
    function append (text) {
      current.output += text
      if (current.output.length > MAX_OUTPUT) {
        current.output = current.output.slice(-MAX_OUTPUT)
        current.truncated = true
      }
    }

    var child
    try {
      child = childProcess.spawn(settings.python, ['-u', script], {
        cwd: cwd || path.dirname(script),
        windowsHide: true,
        env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }),
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (err) {
      current.running = false
      current.status = 'failed'
      append('Unable to start updater: ' + err.message + '\n')
      return { error: 'Unable to start mod updater: ' + err.message, status: 500 }
    }
    function capture (stream) {
      var decoder = new StringDecoder('utf8')
      stream.on('data', function (chunk) { append(decoder.write(chunk)) })
      stream.on('end', function () { append(decoder.end()) })
    }
    capture(child.stdout)
    capture(child.stderr)
    child.on('error', function (err) {
      current.status = 'failed'
      append('Unable to run updater: ' + err.message + '\n')
    })
    child.on('close', function (code, signal) {
      current.running = false
      if (current.status === 'failed') return
      if (code === 0) {
        current.status = 'completed'
        if (onSuccess && type === 'mods') onSuccess()
      } else {
        current.status = 'failed'
        append('Updater exited ' + (signal ? 'with signal ' + signal : 'with code ' + code) + '.\n')
      }
    })
    return { status: 202 }
  }

  return { snapshot: snapshot, start: start }
}
