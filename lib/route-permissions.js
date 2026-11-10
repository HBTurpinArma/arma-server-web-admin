module.exports = function (config, group, actionForRequest) {
  return function (req, res, next) {
    var action = actionForRequest(req)
    if (!config.auth || !action) return next()
    var user = req.auth && Array.isArray(config.auth) && config.auth.find(function (item) {
      return item.username === req.auth.user
    })
    if (user && user.permissions && user.permissions[group] && user.permissions[group][action] === true) return next()
    res.status(403).send('You do not have permission to ' + action + ' ' + group + '.')
  }
}
