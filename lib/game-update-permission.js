module.exports = function (user) {
  var permissions = user && user.permissions
  var servers = permissions && permissions.servers
  if (servers && typeof servers.updateGame === 'boolean') return servers.updateGame
  return !!(permissions && permissions.mods && permissions.mods.updateGame === true)
}
