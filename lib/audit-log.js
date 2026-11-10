var fs = require('fs')

var PAGE_SIZE = 100
var BLOCK_SIZE = 8192
var MAX_LINE_SIZE = 256 * 1024
var MAX_SCAN_SIZE = 1024 * 1024

function limited (value) {
  return typeof value === 'string' ? value.slice(0, 200) : undefined
}

module.exports = function (file) {
  function middleware (req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].indexOf(req.method) !== -1) return next()
    var recorded = false
    var originalEnd = res.end
    function record (aborted) {
      if (recorded) return
      recorded = true
      var pathname = req.originalUrl.split('?')[0].slice(0, 1000)
      var entry = {
        time: new Date().toISOString(),
        user: req.auth ? req.auth.user : null,
        method: req.method,
        path: pathname,
        status: aborted ? null : res.statusCode,
        aborted: aborted
      }
      var body = req.body || {}
      var fields = {}
      var allowed = {
        '/api/accounts': ['username'],
        '/api/servers': ['title'],
        '/api/missions': ['game'],
        '/api/missions/workshop': ['id'],
        '/api/preset-sets': ['name']
      }
      ;(allowed[pathname] || []).forEach(function (name) {
        var value = limited(body[name])
        if (value !== undefined) fields[name] = value
      })
      if (req.file) fields.files = [limited(req.file.originalname)]
      if (Array.isArray(req.files)) {
        fields.files = req.files.slice(0, 64).map(function (item) { return limited(item.originalname) })
      }
      if (Object.keys(fields).length) entry.details = fields
      try {
        fs.appendFileSync(file, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 })
      } catch (err) {
        console.error('Unable to write panel audit log:', err)
        if (!res.headersSent) res.setHeader('X-Audit-Log-Error', 'Unable to save audit event')
      }
    }
    res.end = function () {
      record(false)
      return originalEnd.apply(this, arguments)
    }
    res.on('close', function () { record(true) })
    next()
  }

  function read (cursor, filters) {
    filters = filters || {}
    var userFilter = (filters.user || '').toLowerCase()
    var actionFilter = (filters.action || '').toLowerCase()
    function matches (entry) {
      var user = (entry.user || 'Unauthenticated').toLowerCase()
      var action = ((entry.method || '') + ' ' + (entry.path || '')).toLowerCase()
      return user.indexOf(userFilter) !== -1 && action.indexOf(actionFilter) !== -1
    }
    var fd
    try {
      fd = fs.openSync(file, 'r')
    } catch (err) {
      if (err.code === 'ENOENT') return { entries: [], nextCursor: null }
      throw err
    }
    try {
      var size = fs.fstatSync(fd).size
      var position = cursor === undefined ? size : cursor
      if (!Number.isSafeInteger(position) || position < 0 || position > size) {
        var invalid = new Error('Invalid audit log cursor')
        invalid.code = 'INVALID_CURSOR'
        throw invalid
      }
      var entries = []
      var fragments = []
      var lineSize = 0
      var nextCursor = null
      var scanned = 0
      while (position > 0 && entries.length < PAGE_SIZE) {
        var start = Math.max(0, position - BLOCK_SIZE)
        var block = Buffer.alloc(position - start)
        var bytes = fs.readSync(fd, block, 0, block.length, start)
        scanned += bytes
        if (bytes !== block.length) throw new Error('Unable to read complete audit log block')
        var end = block.length
        for (var i = block.length - 1; i >= 0; i--) {
          if (block[i] !== 10) continue
          var fragment = block.slice(i + 1, end)
          lineSize += fragment.length
          if (lineSize > MAX_LINE_SIZE) throw new Error('Audit log entry is too large')
          if (fragment.length) fragments.unshift(fragment)
          if (lineSize) {
            var entry = JSON.parse(Buffer.concat(fragments).toString('utf8'))
            if (matches(entry)) entries.push(entry)
            fragments = []
            lineSize = 0
            if (entries.length === PAGE_SIZE || scanned >= MAX_SCAN_SIZE) {
              nextCursor = start + i + 1
              break
            }
          }
          end = i
        }
        if (nextCursor !== null) break
        var remainder = block.slice(0, end)
        lineSize += remainder.length
        if (lineSize > MAX_LINE_SIZE) throw new Error('Audit log entry is too large')
        if (remainder.length) fragments.unshift(remainder)
        position = start
      }
      if (nextCursor === null && lineSize) {
        var firstEntry = JSON.parse(Buffer.concat(fragments).toString('utf8'))
        if (matches(firstEntry)) entries.push(firstEntry)
      }
      return { entries: entries, nextCursor: nextCursor || null }
    } finally {
      fs.closeSync(fd)
    }
  }

  return { middleware: middleware, read: read }
}
