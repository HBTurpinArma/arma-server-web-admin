var canView = require('./view-permissions')

module.exports = function (io, config, sources) {
  var groups = ['missions', 'mods', 'servers']

  function send (socket, group) {
    var session = socket.request.session
    var username = session && session.user
    socket.emit(group, canView(config, username, group) ? sources[group]() : [])
  }

  function refresh (socket) {
    groups.forEach(function (group) { send(socket, group) })
    socket.emit('permissions-changed')
  }

  io.on('connection', function (socket) {
    groups.forEach(function (group) { send(socket, group) })
    socket.emit('settings', sources.settings())
  })

  return {
    broadcast: function (group) {
      Object.keys(io.sockets.connected).forEach(function (id) {
        send(io.sockets.connected[id], group)
      })
    },
    refresh: function () {
      Object.keys(io.sockets.connected).forEach(function (id) {
        refresh(io.sockets.connected[id])
      })
    }
  }
}
