var assert = require('assert')
var fs = require('fs')
var os = require('os')
var path = require('path')
var Missions = require('../lib/missions')
var Mods = require('../lib/mods')
var Logs = require('../lib/logs')
var Manager = require('../lib/manager')

describe('multi-game manager configuration', function () {
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
