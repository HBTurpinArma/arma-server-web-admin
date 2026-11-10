module.exports = function (config, req, permission) {
  var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
    return item.username === req.auth.user
  })
  return !!(user && user.permissions && user.permissions.presets && user.permissions.presets[permission] === true)
}
