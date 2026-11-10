var express = require('express')
var fs = require('fs')
var path = require('path')
var crypto = require('crypto')
var hasPresetPermission = require('../lib/preset-permissions')
var canUpdateGame = require('../lib/game-update-permission')
var canView = require('../lib/view-permissions')
var canViewAuditLog = require('../lib/audit-permission')

var permissions = {
  servers: ['view', 'start', 'stop', 'create', 'edit', 'delete', 'updateGame'],
  missions: ['view', 'create', 'delete'],
  mods: ['view', 'delete', 'update'],
  logs: ['view', 'delete'],
  presets: ['edit', 'delete'],
  accounts: ['manage', 'auditLog']
}

function isAdmin (user) {
  return !!(user && user.permissions && user.permissions.accounts &&
    user.permissions.accounts.manage === true)
}

function publicAccount (user) {
  var permissions = Object.assign({}, user.permissions)
  permissions.accounts = Object.assign({}, permissions.accounts, { auditLog: canViewAuditLog(user) })
  permissions.servers = Object.assign({}, permissions.servers, { updateGame: canUpdateGame(user) })
  if (permissions.mods) {
    permissions.mods = Object.assign({}, permissions.mods)
    delete permissions.mods.updateGame
  }
  return { username: user.username, permissions: permissions }
}

module.exports = function (config, defaultPath, onChange) {
  var router = express.Router()
  var file = config.accountsPath || defaultPath

  router.use(function (req, res, next) {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.get('/me', function (req, res) {
    var unrestricted = !config.auth
    var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
      return item.username === req.auth.user
    })
    res.json({
      username: user ? user.username : null,
      canManage: isAdmin(user),
      canViewAuditLog: canViewAuditLog(user),
      canEditPresets: hasPresetPermission(config, req, 'edit'),
      canDeletePresets: hasPresetPermission(config, req, 'delete'),
      canUpdateMods: !!(user && user.permissions && user.permissions.mods && user.permissions.mods.update === true),
      canUpdateGame: canUpdateGame(user),
      permissions: {
        servers: {
          view: canView(config, req.auth && req.auth.user, 'servers'),
          edit: unrestricted || !!(user && user.permissions && user.permissions.servers && user.permissions.servers.edit === true),
          delete: unrestricted || !!(user && user.permissions && user.permissions.servers && user.permissions.servers.delete === true)
        },
        missions: {
          view: canView(config, req.auth && req.auth.user, 'missions'),
          create: unrestricted || !!(user && user.permissions && user.permissions.missions && user.permissions.missions.create === true),
          delete: unrestricted || !!(user && user.permissions && user.permissions.missions && user.permissions.missions.delete === true)
        },
        logs: {
          view: unrestricted || !!(user && user.permissions && user.permissions.logs && user.permissions.logs.view === true),
          delete: unrestricted || !!(user && user.permissions && user.permissions.logs && user.permissions.logs.delete === true)
        },
        mods: { view: canView(config, req.auth && req.auth.user, 'mods') }
      }
    })
  })

  router.use(function (req, res, next) {
    var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
      return item.username === req.auth.user
    })
    if (!isAdmin(user)) return res.status(403).send('You do not have permission to manage accounts')
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'XMLHttpRequest') {
      return res.status(403).send('Invalid request')
    }
    next()
  })

  router.get('/', function (req, res) {
    res.json({ accounts: config.auth.map(publicAccount), permissions: permissions })
  })

  function save (nextAccounts, res) {
    var temp
    try {
      var diskAccounts = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (JSON.stringify(diskAccounts) !== JSON.stringify(config.auth)) {
        return res.status(409).send('Accounts file changed outside the application. Restart before making changes.')
      }
      temp = path.join(path.dirname(file), '.' + path.basename(file) + '.' + crypto.randomBytes(16).toString('hex') + '.tmp')
      fs.writeFileSync(temp, JSON.stringify(nextAccounts, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      fs.renameSync(temp, file)
      temp = null
      config.auth.splice.apply(config.auth, [0, config.auth.length].concat(nextAccounts))
      if (onChange) onChange()
      res.json({ success: true })
    } catch (err) {
      if (temp) {
        try { fs.unlinkSync(temp) } catch (cleanupErr) {
          if (cleanupErr.code !== 'ENOENT') console.error('Unable to remove temporary accounts file:', cleanupErr)
        }
      }
      console.error('Unable to save accounts:', err)
      res.status(500).send('Unable to save accounts file')
    }
  }

  function validate (body, existing) {
    if (!body || typeof body.username !== 'string' ||
        !/^[a-zA-Z0-9_.@-]{1,64}$/.test(body.username)) return 'Username must be 1-64 letters, numbers, or . _ @ -'
    if (typeof body.password !== 'string' || body.password.length > 256 ||
        (!existing && !body.password) || /[\r\n]/.test(body.password)) return 'A password of up to 256 characters is required'
    if (!body.permissions || typeof body.permissions !== 'object' || Array.isArray(body.permissions)) return 'Invalid permissions'
    var valid = Object.keys(permissions).every(function (group) {
      return body.permissions[group] && typeof body.permissions[group] === 'object' &&
        permissions[group].every(function (action) {
          if (group === 'accounts' && action === 'auditLog' && body.permissions[group][action] === undefined) return true
          return typeof body.permissions[group][action] === 'boolean'
        })
    })
    return valid ? null : 'Invalid permissions'
  }

  function makeAccount (body, existing) {
    var result = Object.assign({}, existing || {})
    var merged = Object.assign({}, result.permissions || {})
    Object.keys(permissions).forEach(function (group) {
      merged[group] = Object.assign({}, merged[group] || {})
      permissions[group].forEach(function (action) {
        if (group === 'accounts' && action === 'auditLog' && body.permissions[group][action] === undefined) {
          merged[group][action] = canViewAuditLog(existing)
        } else {
          merged[group][action] = body.permissions[group][action]
        }
      })
    })
    delete merged.mods.updateGame
    result.username = body.username
    result.password = body.password || existing.password
    result.permissions = merged
    return result
  }

  function update (req, res, existing) {
    var error = validate(req.body, existing)
    if (error) return res.status(400).send(error)
    if (config.auth.some(function (user) { return user !== existing && user.username === req.body.username })) {
      return res.status(409).send('Username already exists')
    }
    var replacement = makeAccount(req.body, existing)
    var nextAccounts = existing
      ? config.auth.map(function (user) { return user === existing ? replacement : user })
      : config.auth.concat([replacement])
    if (!nextAccounts.some(isAdmin)) return res.status(400).send('At least one account manager must remain')
    save(nextAccounts, res)
  }

  router.post('/', function (req, res) { update(req, res, null) })
  router.put('/:username', function (req, res) {
    var existing = config.auth.find(function (user) { return user.username === req.params.username })
    if (!existing) return res.status(404).send('Account not found')
    update(req, res, existing)
  })
  router.delete('/:username', function (req, res) {
    var existing = config.auth.find(function (user) { return user.username === req.params.username })
    if (!existing) return res.status(404).send('Account not found')
    var nextAccounts = config.auth.filter(function (user) { return user !== existing })
    if (!nextAccounts.some(isAdmin)) return res.status(400).send('At least one account manager must remain')
    save(nextAccounts, res)
  })

  return router
}
