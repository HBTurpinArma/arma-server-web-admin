module.exports = function (user) {
  var accounts = user && user.permissions && user.permissions.accounts
  if (!accounts) return false
  if (accounts.auditLog !== undefined) return accounts.auditLog === true
  return accounts.manage === true
}
