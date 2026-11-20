var assert = require('assert')
var fs = require('fs')
var os = require('os')
var path = require('path')
var Missions = require('../lib/missions')
var Mods = require('../lib/mods')
var Logs = require('../lib/logs')
var Manager = require('../lib/manager')

describe('multi-game manager configuration', function () {
  it('loads primary and TAW log folders with distinct identities', function (done) {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-logs-'))
    var taw = path.join(root, 'taw_logging')
    fs.mkdirSync(taw)
    fs.writeFileSync(path.join(root, 'server.rpt'), 'primary')
    fs.writeFileSync(path.join(root, 'same.log'), 'primary log')
    fs.writeFileSync(path.join(taw, 'same.log'), 'taw log')
    fs.writeFileSync(path.join(taw, 'same.json'), JSON.stringify({
      player1: { meta: { playerName: 'Player One' } },
      player2: { meta: { playerName: 'Player Two' } },
      HC17728: { meta: { playerName: 'HC1' } },
      _mission: { missionName: 'operation_test' }
    }))
    fs.writeFileSync(path.join(taw, 'event.json'), '{}')
    fs.writeFileSync(path.join(taw, 'ignored.txt'), 'ignored')

    var logs = new Logs({ type: 'windows', logsPath: root })
    logs.logFiles(function (err, files) {
      try {
        assert.ifError(err)
        assert.strictEqual(files.length, 4)
        assert(files.some(function (file) { return file.id === 'server.rpt' && file.source === 'primary' }))
        assert(files.some(function (file) { return file.id === 'same.log' && file.source === 'primary' }))
        var paired = files.find(function (file) { return file.id === 'taw/same' && file.source === 'taw' })
        assert(paired)
        assert.strictEqual(paired.files.length, 2)
        assert.strictEqual(paired.files.map(function (file) { return file.name }).join(','), 'same.json,same.log')
        assert.strictEqual(paired.missionName, 'operation_test')
        assert.strictEqual(paired.playerCount, 2)
        assert(files.some(function (file) { return file.id === 'taw/event' && file.source === 'taw' }))
        logs.getLogFile('same.log', 'taw', function (err, file) {
          try {
            assert.ifError(err)
            assert.strictEqual(file.path, path.join(taw, 'same.log'))
            done()
          } catch (assertionError) {
            done(assertionError)
          } finally {
            fs.rmSync(root, { recursive: true, force: true })
          }
        })
      } catch (assertionError) {
        fs.rmSync(root, { recursive: true, force: true })
        done(assertionError)
      }
    })
  })

  it('initializes real managers with game-specific paths', async function () {
    var root = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-multigame-'))
    var arma = path.join(root, 'arma3')
    var reforger = path.join(root, 'reforger')
    fs.mkdirSync(arma)
    fs.mkdirSync(reforger)
    var config = {
      type: 'windows',
      logsPath: root,
      games: {
        arma3: { path: arma, modPath: arma, missionPath: arma },
        reforger: { path: reforger, modPath: reforger, missionPath: reforger }
      }
    }

    try {
      var logs = new Logs(config)
      var manager = new Manager(config, logs)
      var missions = new Missions(config)
      var mods = new Mods(config)
      assert.deepStrictEqual(manager.getServers(), [])
      assert.strictEqual(logs.logsPath(), root)
      assert.strictEqual(missions.missionPath('arma3', 'test.pbo'), path.join(arma, 'test.pbo'))
      assert.strictEqual(missions.missionPath('reforger', 'test.pbo'), path.join(reforger, 'test.pbo'))

      await Promise.all([
        new Promise(function (resolve) {
          var completed = 0
          missions.on('missions', function () {
            if (++completed === 2) resolve()
          })
        }),
        new Promise(function (resolve) {
          mods.once('mods', resolve)
          mods.updateMods()
        })
      ])
    } finally {
      fs.rmdirSync(arma)
      fs.rmdirSync(reforger)
      fs.rmdirSync(root)
    }
  })
})
