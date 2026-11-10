var groups = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  '!@#$%^&*()-_=+'
]
var characters = groups.join('')
var limit = 256 - (256 % characters.length)

module.exports = function (crypto) {
  var password
  do {
    password = ''
    while (password.length < 16) {
      var bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      for (var i = 0; i < bytes.length && password.length < 16; i++) {
        if (bytes[i] < limit) password += characters.charAt(bytes[i] % characters.length)
      }
    }
  } while (!groups.every(function (group) {
    return password.split('').some(function (character) { return group.indexOf(character) !== -1 })
  }))
  return password
}
