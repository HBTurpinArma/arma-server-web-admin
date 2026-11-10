var express = require('express')
var bodyParser = require('body-parser')
var morgan = require('morgan')
var path = require('path')
var serveStatic = require('serve-static')
var webpack = require('webpack')
var webpackMiddleware = require('webpack-dev-middleware')

var config = require('./config')
var webpackConfig = require('./webpack.config')
var setupSessionAuth = require('./lib/session-auth')
var routePermissions = require('./lib/route-permissions')
var Manager = require('./lib/manager')
var Missions = require('./lib/missions')
var Mods = require('./lib/mods')
var Logs = require('./lib/logs')
var Settings = require('./lib/settings')
var createModUpdater = require('./lib/mod-updater')
var createLiveViewData = require('./lib/live-view-data')


var app = express()
var server = require('http').Server(app)
var io = require('socket.io')(server)

app.get('/theme.js', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'theme.js'))
})

// Mounted before session authentication so presets are publicly accessible.
if (config.presetsPath) {
  app.use('/api/presets', require('./routes/presets')(config.presetsPath))
  app.get('/presets', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'presets.html'))
  })
  app.get('/presets.js', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'presets.js'))
  })
} else {
  app.get('/api/presets', function (req, res) {
    res.status(404).send('Presets are not configured. Set presetsPath in config.js to enable them.')
  })
}

app.use('/api/missions', require('./routes/mission-downloads')(config))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

var auth = setupSessionAuth(config, app, io)

morgan.token('user', function (req) { return req.auth ? req.auth.user : 'anon' })
app.use(morgan(config.logFormat || 'dev'))

app.use(serveStatic(path.join(__dirname, 'public')))

var logs = new Logs(config)

var manager = new Manager(config, logs)
manager.load()

var missions = new Missions(config)
var mods = new Mods(config)
mods.updateMods()
var modUpdater = createModUpdater(config.modUpdater, function () { mods.updateMods() })

var settings = new Settings(config)
var liveViewData = createLiveViewData(io, config, {
  missions: function () { return missions.missions },
  mods: function () { return mods.mods },
  servers: function () { return manager.getServers() },
  settings: function () { return settings.getPublicSettings() }
})

app.use('/api/logs', routePermissions(config, 'logs', function (req) {
  return req.method === 'DELETE' ? 'delete' : 'view'
}), require('./routes/logs')(logs))
app.use('/api/missions', routePermissions(config, 'missions', function (req) {
  if (req.method === 'DELETE') return 'delete'
  if (req.method === 'POST') return req.path === '/refresh' ? 'view' : 'create'
  return 'view'
}), require('./routes/missions')(missions))
app.use('/api/mods', routePermissions(config, 'mods', function (req) {
  return req.method === 'DELETE' ? 'delete' : 'view'
}), require('./routes/mods')(mods))
app.use('/api/mod-updater', require('./routes/mod-updater')(config, modUpdater))
app.use('/api/servers', routePermissions(config, 'servers', function (req) {
  if (req.method === 'DELETE') return 'delete'
  if (req.method === 'PUT' || req.method === 'PATCH') return 'edit'
  if (req.method === 'POST') {
    if (/\/(start|headlessrefresh)\/?$/.test(req.path)) return 'start'
    if (/\/stop\/?$/.test(req.path)) return 'stop'
    if (/\/delete\/?$/.test(req.path)) return 'delete'
    return 'create'
  }
  return 'view'
}), require('./routes/servers')(manager, mods))
app.use('/api/settings', require('./routes/settings')(settings))
app.use('/api/games', require('./routes/games')(config.games))
app.use('/api/accounts', require('./routes/accounts')(config, path.join(__dirname, 'accounts.json'), function () {
  auth.disconnectInvalid()
  liveViewData.refresh()
}))
if (config.presetsPath) {
  app.use('/api/preset-sets', require('./routes/preset-sets')(config))
  app.use('/api/preset-uploads', require('./routes/preset-uploads')(config))
}

missions.on('missions', function () {
  liveViewData.broadcast('missions')
})

mods.on('mods', function () {
  liveViewData.broadcast('mods')
})

manager.on('servers', function () {
  liveViewData.broadcast('servers')
})

if (require.main === module) {
  var webpackCompiler = webpack(webpackConfig)

  app.use(webpackMiddleware(webpackCompiler, {
    publicPath: webpackConfig.output.publicPath
  }))

  server.listen(config.port, config.host)
}

module.exports = app