var path = require('path')

function configuredValue (value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function brandingValues (config) {
  var branding = config.branding && typeof config.branding === 'object' ? config.branding : {}
  return {
    title: configuredValue(branding.title, 'Arma Server Admin'),
    navigationTitle: configuredValue(branding.navigationTitle, 'Arma Server Admin'),
    icon: configuredValue(branding.icon, '/favicon.ico')
  }
}

module.exports = function (config) {
  var values = brandingValues(config)
  var serialized = JSON.stringify(values).replace(/[<>&\u2028\u2029]/g, function (character) {
    return {
      '<': '\\u003c',
      '>': '\\u003e',
      '&': '\\u0026',
      '\u2028': '\\u2028',
      '\u2029': '\\u2029'
    }[character]
  })

  return function (req, res) {
    res.set('Cache-Control', 'no-store')
    res.type('application/javascript').send(
      'window.armaBranding = ' + serialized + ';' +
      'document.title = window.armaBranding.title;' +
      'var iconLink = document.querySelector(\'link[rel~="icon"]\') || document.createElement("link");' +
      'iconLink.rel = "icon";' +
      'iconLink.href = window.armaBranding.icon;' +
      'if (!iconLink.parentNode) document.head.appendChild(iconLink);'
    )
  }
}

module.exports.icon = function (config, publicDirectory) {
  var icon = brandingValues(config).icon
  if (icon.charAt(0) !== '/' || icon.charAt(1) === '/' || icon.indexOf('\\') !== -1) {
    return function (req, res, next) { next() }
  }

  var pathname = icon.split(/[?#]/)[0]
  var filename
  try {
    filename = decodeURIComponent(pathname)
  } catch (err) {
    throw new Error('Invalid branding icon URL: ' + icon)
  }
  var root = path.resolve(publicDirectory)
  var resolved = path.resolve(root, '.' + filename)
  var relative = path.relative(root, resolved)
  if (!relative || relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) {
    throw new Error('Branding icon must be inside the public directory: ' + icon)
  }

  return function (req, res, next) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path !== pathname) return next()
    res.sendFile(resolved, function (err) {
      if (err) next(err)
    })
  }
}
