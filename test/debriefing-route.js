var assert = require('assert')
var express = require('express')
var fs = require('fs')
var os = require('os')
var path = require('path')
var request = require('supertest')
var createLogsRoutes = require('../routes/logs')

describe('leaderboard route', function () {
  it('downloads the generated PNG instead of the source JSON', async function () {
    var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arma-debriefing-route-'))
    var imagePath = path.join(directory, 'leaderboard.png')
    var imageContent = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    fs.writeFileSync(imagePath, imageContent)
    var logs = {
      getLogFile: function (name, source, callback) {
        assert.strictEqual(name, 'event.json')
        assert.strictEqual(source, 'taw')
        callback(null, { path: path.join(directory, 'event.json') })
      }
    }
    var debriefing = {
      generate: function (jsonPath, callback) {
        assert.strictEqual(path.basename(jsonPath), 'event.json')
        callback(null, {
          path: imagePath,
          filename: 'event-leaderboard.png',
          cleanup: function () {}
        })
      }
    }
    var app = express()
    app.use('/api/logs', createLogsRoutes(logs, debriefing))

    try {
      var response = await request(app).get('/api/logs/taw/event.json/leaderboard').buffer(true).expect(200)
      assert(response.headers['content-disposition'].includes('event-leaderboard.png'))
      assert.strictEqual(response.headers['content-type'], 'image/png')
      assert.deepStrictEqual(response.body, imageContent)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
