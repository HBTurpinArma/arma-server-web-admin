module.exports = function (config, username, group) {
  if (!config.auth) return true
  var user = username && Array.isArray(config.auth) && config.auth.find(function (item) {
    return item.username === username
  })
  return !!(user && user.permissions && user.permissions[group] && user.permissions[group].view === true)
}
