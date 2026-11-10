var assert = require('assert')
var crypto = require('crypto')
var generatePassword = require('../public/js/app/password-generator')

describe('password generation', function () {
  it('generates 16 characters including uppercase, lowercase, numbers and symbols', function () {
    for (var i = 0; i < 100; i++) {
      var password = generatePassword(crypto.webcrypto)
      assert.strictEqual(password.length, 16)
      assert(/[A-Z]/.test(password))
      assert(/[a-z]/.test(password))
      assert(/[0-9]/.test(password))
      assert(/[!@#$%^&*()\-_=+]/.test(password))
      assert(/^[A-Za-z0-9!@#$%^&*()\-_=+]{16}$/.test(password))
    }
  })

  it('rejects biased bytes and retries passwords missing required character groups', function () {
    var calls = 0
    var fakeCrypto = {
      getRandomValues: function (bytes) {
        calls++
        if (calls === 1) bytes.fill(255)
        else if (calls === 2) bytes.fill(0)
        else {
          for (var i = 0; i < bytes.length; i++) bytes[i] = [0, 26, 52, 62][i % 4]
        }
        return bytes
      }
    }
    assert.strictEqual(generatePassword(fakeCrypto), 'Aa0!Aa0!Aa0!Aa0!')
    assert.strictEqual(calls, 3)
  })
})
