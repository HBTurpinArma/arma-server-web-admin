var basicAuth = require('express-basic-auth')

function getBasicAuthUsers (configAuth) {
  var basicAuthUsers = {}
  for (const [k, v] of Object.entries(configAuth)) {
    basicAuthUsers[k] = v.password
  }

  return basicAuthUsers
}

module.exports = function (config, app) {
  if (!config.auth) {
    return
  }
  
  app.use(basicAuth({
    challenge: true,
    users: getBasicAuthUsers(config.auth)
  }))


}


