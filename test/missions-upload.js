var assert = require('assert')
var fs = require('fs')
var os = require('os')
var path = require('path')
var Missions = require('../lib/missions')

describe('mission uploads', function () {
  var directory
  var manager

  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-upload-test-'))
    manager = Object.create(Missions.prototype)
    manager.config = { games: { arma3: { missionPath: directory } } }
    manager.updateMissions = function () {}
  })

  afterEach(function () {
    fs.readdirSync(directory).forEach(function (name) {
      fs.unlinkSync(path.join(directory, name))
    })
    fs.rmdirSync(directory)
  })

  it('uploads and atomically replaces an existing lowercased mission', function (done) {
    var source = path.join(directory, 'upload')
    var destination = path.join(directory, 'operation.altis.pbo')
    fs.writeFileSync(source, 'new mission')
    fs.writeFileSync(destination, 'old mission')
    manager.handleUpload('arma3', { originalname: 'Operation.Altis.pbo', path: source }, function (err) {
      assert.ifError(err)
      assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'new mission')
      assert.deepStrictEqual(fs.readdirSync(directory), ['operation.altis.pbo'])
      done()
    })
  })

  it('uploads a mission that does not exist yet', function (done) {
    var source = path.join(directory, 'upload')
    fs.writeFileSync(source, 'new mission')
    manager.handleUpload('arma3', { originalname: 'Operation.Altis.pbo', path: source }, function (err) {
      assert.ifError(err)
      assert.strictEqual(fs.readFileSync(path.join(directory, 'operation.altis.pbo'), 'utf8'), 'new mission')
      done()
    })
  })

  it('preserves the previous mission when staging fails', function (done) {
    var destination = path.join(directory, 'operation.altis.pbo')
    fs.writeFileSync(destination, 'old mission')
    manager.handleUpload('arma3', {
      originalname: 'Operation.Altis.pbo',
      path: path.join(directory, 'missing-upload')
    }, function (err) {
      assert(err)
      assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'old mission')
      assert.deepStrictEqual(fs.readdirSync(directory), ['operation.altis.pbo'])
      done()
    })
  })
})
