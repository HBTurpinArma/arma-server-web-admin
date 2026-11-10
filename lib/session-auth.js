var crypto = require('crypto')
var session = require('express-session')
var basicAuth = require('express-basic-auth')

var SESSION_LENGTH = 8 * 60 * 60 * 1000

module.exports = function (config, app, io) {
  if (config.auth && !Array.isArray(config.auth)) {
    if (config.auth.username && config.auth.password) {
      if (!config.auth.permissions) {
        config.auth.permissions = {
          servers: { view: true, start: true, stop: true, create: true, edit: true, delete: true },
          missions: { view: true, create: true, delete: true },
          mods: { view: true, delete: true },
          logs: { view: true, delete: true }
        }
      }
      config.auth = [config.auth]
    } else if (!config.auth.username && !config.auth.password) {
      config.auth = null
    } else {
      throw new Error('Authentication requires both username and password')
    }
  }
  var secret = crypto.randomBytes(32).toString('hex')
  if (config.sessionSecureCookies) app.set('trust proxy', 1)
  var store = new session.MemoryStore()
  var cleanup = setInterval(function () {
    store.all(function (err) {
      if (err) console.error('Unable to clean expired sessions:', err)
    })
  }, 60 * 60 * 1000)
  cleanup.unref()
  var middleware = session({
    secret: secret,
    store: store,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: !!config.sessionSecureCookies, maxAge: SESSION_LENGTH }
  })
  app.use(middleware)

  function fingerprint (password) {
    return crypto.createHmac('sha256', secret).update(password).digest('hex')
  }

  function isValid (state) {
    if (!state || !state.user || !Array.isArray(config.auth)) return false
    var account = config.auth.find(function (item) { return item.username === state.user })
    return !!(account && typeof account.password === 'string' &&
      state.fingerprint === fingerprint(account.password) &&
      state.expiresAt > Date.now())
  }

  function disconnect (predicate) {
    if (!io) return
    Object.keys(io.sockets.connected).forEach(function (id) {
      var socket = io.sockets.connected[id]
      if (predicate(socket.request)) socket.disconnect(true)
    })
  }

  app.get('/login', function (req, res) {
    res.set('Cache-Control', 'no-store')
    res.sendFile(require('path').join(__dirname, '..', 'public', 'login.html'))
  })

  app.post('/api/session', function (req, res) {
    res.set('Cache-Control', 'no-store')
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.status(403).send('Invalid request')
    if (!Array.isArray(config.auth)) return res.status(403).send('Authentication is disabled')
    var username = req.body && req.body.username
    var password = req.body && req.body.password
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 256 || password.length > 256) {
      return res.status(400).send('Invalid credentials')
    }
    var account = config.auth.find(function (item) {
      return basicAuth.safeCompare(username, item.username) & basicAuth.safeCompare(password, item.password)
    })
    if (!account) return res.status(401).send('Invalid username or password')
    var oldId = req.sessionID
    req.session.regenerate(function (err) {
      if (err) return res.status(500).send('Unable to create session')
      disconnect(function (socketRequest) { return socketRequest.sessionID === oldId })
      req.session.user = account.username
      req.session.fingerprint = fingerprint(account.password)
      req.session.expiresAt = Date.now() + SESSION_LENGTH
      req.session.save(function (saveErr) {
        if (saveErr) return res.status(500).send('Unable to save session')
        res.json({ success: true })
      })
    })
  })

  app.post('/api/session/logout', function (req, res) {
    res.set('Cache-Control', 'no-store')
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') return res.status(403).send('Invalid request')
    var id = req.sessionID
    req.session.destroy(function (err) {
      if (err) return res.status(500).send('Unable to end session')
      disconnect(function (socketRequest) { return socketRequest.sessionID === id })
      res.clearCookie('connect.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: !!config.sessionSecureCookies })
      res.json({ success: true })
    })
  })

  if (io) {
    io.use(function (socket, next) {
      var origin = socket.request.headers.origin
      if (origin) {
        try {
          if (new URL(origin).host !== socket.request.headers.host) return next(new Error('Invalid origin'))
        } catch (err) {
          return next(new Error('Invalid origin'))
        }
      }
      middleware(socket.request, {}, function (err) {
        if (err) return next(err)
        if (config.auth && !isValid(socket.request.session)) return next(new Error('Unauthorized'))
        next()
      })
    })
    io.on('connection', function (socket) {
      if (config.auth) {
        var timer = setTimeout(function () { socket.disconnect(true) }, Math.max(0, socket.request.session.expiresAt - Date.now()))
        socket.on('disconnect', function () { clearTimeout(timer) })
      }
    })
  }

  app.use(function (req, res, next) {
    if (!config.auth) return next()
    if (!isValid(req.session)) {
      if (req.path.indexOf('/api/') === 0) return res.status(401).send('Please sign in')
      return res.redirect('/login')
    }
    if (['GET', 'HEAD', 'OPTIONS'].indexOf(req.method) === -1 && req.get('Origin')) {
      try {
        if (new URL(req.get('Origin')).host !== req.get('Host')) return res.status(403).send('Invalid origin')
      } catch (err) {
        return res.status(403).send('Invalid origin')
      }
    }
    res.set('Cache-Control', 'no-store')
    req.auth = { user: req.session.user }
    next()
  })

  return {
    disconnectInvalid: function () {
      disconnect(function (socketRequest) { return !isValid(socketRequest.session) })
    }
  }
}
