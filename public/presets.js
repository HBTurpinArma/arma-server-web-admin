(function () {
  // PLACEHOLDER workshop ids: replace with the real compat mod for each DLC.
  // `match` is tested against the DLC name inside the preset's dlc-list.
  var DLC_COMPAT = {
    'Reaction Forces': { match: /reaction forces/i, displayName: 'Reaction Forces - Creator DLC Compatibility Data for Non-Owners', workshopId: '3150497912' },
    'Western Sahara': { match: /western sahara/i, displayName: 'Western Sahara - Creator DLC Compatibility Data for Non-Owners', workshopId: '2636962953' },
    'Expeditionary Forces': { match: /expeditionary forces/i, displayName: 'Expeditionary Forces - Compatibility Data For Non-Owners', workshopId: '3348605126' }
  }

  var STEAM_URL = 'https://steamcommunity.com/sharedfiles/filedetails/?id='
  var STORAGE_KEY = 'presetBuilder.v1'
  var cache = {}

  var baseData = { mods: [], dlcs: [] }
  var optionalData = { mods: [], dlcs: [] }
  var baseChecks = []
  var optionalChecks = []
  var dlcButtons = []
  var owned = {} // DLC_COMPAT key -> true
  var curatedSets = {}
  var isAdmin = false
  var ADMIN_FLAG = 'presetBuilder.admin'

  function $ (id) { return document.getElementById(id) }

  function byName (a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  }

  function fetchPreset (file) {
    if (cache[file]) return Promise.resolve(cache[file])
    return fetch('/api/presets/' + encodeURIComponent(file))
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + file)
        return r.text()
      })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html')
        var mods = Array.prototype.map.call(doc.querySelectorAll('tr[data-type="ModContainer"]'), function (tr) {
          var nameEl = tr.querySelector('[data-type="DisplayName"]')
          var linkEl = tr.querySelector('[data-type="Link"]')
          var href = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent || '') : ''
          var match = /[?&]id=(\d+)/.exec(href)
          var name = nameEl ? nameEl.textContent.trim() : ''
          return { name: name, id: match ? match[1] : null, row: tr }
        }).sort(byName)
        var dlcs = Array.prototype.map.call(doc.querySelectorAll('tr[data-type="DlcContainer"]'), function (tr) {
          var nameEl = tr.querySelector('[data-type="DisplayName"]')
          return { name: nameEl ? nameEl.textContent.trim() : '', row: tr }
        })
        cache[file] = { mods: mods, dlcs: dlcs }
        return cache[file]
      })
  }

  function modKey (mod) {
    return mod.id ? 'id:' + mod.id : 'name:' + mod.name.toLowerCase()
  }

  function setEntryKey (entry) {
    var s = String(entry).trim()
    return /^\d+$/.test(s) ? 'id:' + s : 'name:' + s.toLowerCase()
  }

  function makeCheckbox (container, labelText, checked, data) {
    var label = document.createElement('label')
    var input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    label.appendChild(input)
    label.appendChild(document.createTextNode(' ' + labelText))
    container.appendChild(label)
    return { input: input, label: label, data: data }
  }

  function applyFilter (searchId, checks) {
    var q = $(searchId).value.trim().toLowerCase()
    checks.forEach(function (c) {
      c.label.hidden = q !== '' && c.data.name.toLowerCase().indexOf(q) === -1
    })
  }

  // ---- persistence and sharing ----

  function currentState () {
    return {
      base: $('base').value,
      owned: Object.keys(owned).filter(function (k) { return owned[k] }),
      optional: optionalChecks.filter(function (c) { return c.input.checked }).map(function (c) { return modKey(c.data) })
    }
  }

  function save () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState())) } catch (e) { /* storage unavailable */ }
    history.replaceState(null, '', shareLink())
    refreshSetStates()
  }

  function loadStored () {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (s && Array.isArray(s.owned) && Array.isArray(s.optional)) return s
    } catch (e) { /* ignore corrupt data */ }
    return null
  }

  function encodeList (list) {
    return list.map(encodeURIComponent).join(',')
  }

  function decodeList (str) {
    return str ? str.split(',').map(decodeURIComponent) : []
  }

  function shareLink () {
    var s = currentState()
    var parts = ['b=' + encodeURIComponent(s.base), 'd=' + encodeList(s.owned), 'o=' + encodeList(s.optional)]
    return location.origin + location.pathname + '#' + parts.join('&')
  }

  function loadFromHash () {
    if (!location.hash || location.hash.length < 2) return null
    var params = {}
    location.hash.slice(1).split('&').forEach(function (kv) {
      var i = kv.indexOf('=')
      if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1)
    })
    try {
      return {
        base: params.b ? decodeURIComponent(params.b) : null,
        owned: decodeList(params.d),
        optional: decodeList(params.o)
      }
    } catch (e) {
      return null
    }
  }

  function copyShareLink () {
    var link = shareLink()
    var done = function () { $('share-status').textContent = 'Link copied.' }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link:', link) })
    } else {
      window.prompt('Copy this link:', link)
    }
  }

  // ---- rendering ----

  function renderBase (file) {
    var el = $('base-mods')
    el.textContent = 'Loading...'
    return fetchPreset(file).then(function (data) {
      baseData = data
      el.textContent = ''
      baseChecks = data.mods.map(function (m) {
        var c = makeCheckbox(el, m.name, true, m)
        c.input.disabled = true // required mods are not user-editable
        return c
      })
      renderDlc()
    })
  }

  function renderOptional (file, selectedKeys) {
    var el = $('optional')
    el.textContent = ''
    optionalChecks = []
    if (!file) return Promise.resolve()
    return fetchPreset(file).then(function (data) {
      optionalData = data
      var selected = {}
      selectedKeys.forEach(function (k) { selected[k] = true })
      optionalChecks = data.mods.map(function (m) {
        var c = makeCheckbox(el, m.name, !!selected[modKey(m)], m)
        c.input.addEventListener('change', save)
        return c
      })
      applyFilter('optional-search', optionalChecks)
      renderDlc()
    })
  }

  // Only DLC that the loaded presets list and that have a compat entry are offered.
  function renderDlc () {
    var el = $('dlc')
    el.textContent = ''
    dlcButtons = []
    var listed = baseData.dlcs.concat(optionalData.dlcs)
    Object.keys(DLC_COMPAT).forEach(function (key) {
      var compat = DLC_COMPAT[key]
      var present = listed.some(function (d) { return compat.match.test(d.name) })
      if (!present) return
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = key
      btn.setAttribute('aria-pressed', owned[key] ? 'true' : 'false')
      btn.addEventListener('click', function () {
        owned[key] = !owned[key]
        btn.setAttribute('aria-pressed', owned[key] ? 'true' : 'false')
        save()
      })
      el.appendChild(btn)
      dlcButtons.push({ key: key, button: btn, data: { name: compat.displayName, id: compat.workshopId } })
    })
    if (!dlcButtons.length) el.textContent = 'This preset requires no DLC.'
  }

  function renderSets () {
    var el = $('sets')
    el.textContent = ''
    var names = Object.keys(curatedSets)
    if (!names.length) {
      el.textContent = 'No curated sets available.'
      return
    }
    names.forEach(function (name) {
      var row = document.createElement('div')
      row.className = 'set-row'
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'set-apply'
      btn.dataset.set = name
      btn.textContent = name
      btn.addEventListener('click', function () { toggleSet(curatedSets[name]) })
      row.appendChild(btn)
      if (isAdmin) {
        var del = document.createElement('button')
        del.type = 'button'
        del.className = 'set-delete'
        del.textContent = '\u00d7'
        del.title = 'Delete set'
        del.addEventListener('click', function () { deleteSet(name) })
        row.appendChild(del)
      }
      el.appendChild(row)
    })
    refreshSetStates()
  }

  function deleteSet (name) {
    if (!window.confirm('Delete set "' + name + '"?')) return
    var status = $('set-status')
    fetch('/api/preset-sets/' + encodeURIComponent(name), { method: 'DELETE', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('Not authorised to delete sets.')
        if (!r.ok) return r.text().then(function (t) { throw new Error('Delete failed (' + r.status + '): ' + t) })
        return fetchSets()
      })
      .then(function (sets) {
        curatedSets = sets || {}
        renderSets()
        status.textContent = 'Deleted.'
      })
      .catch(function (e) { status.textContent = e.message })
  }

  // The route is behind basic auth, so the browser prompts for credentials here.
  function checkAuth () {
    var status = $('auth-status')
    fetch('/api/preset-sets/me', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) throw new Error('Login cancelled.')
        if (!r.ok) throw new Error('Login check failed.')
        return r.json()
      })
      .then(function (me) {
        if (!me.canEdit) throw new Error('Logged in as ' + me.user + ' without permission to edit sets.')
        isAdmin = true
        try { sessionStorage.setItem(ADMIN_FLAG, '1') } catch (e) { /* storage unavailable */ }
        $('admin-save').hidden = false
        $('login').hidden = true
        $('logout').hidden = false
        status.textContent = 'Logged in as ' + me.user
        renderSets()
      })
      .catch(function (e) { status.textContent = e.message })
  }

  // Only hides the admin controls; the browser keeps its Basic-auth credentials until it is closed.
  function logout () {
    isAdmin = false
    try { sessionStorage.removeItem(ADMIN_FLAG) } catch (e) { /* storage unavailable */ }
    $('admin-save').hidden = true
    $('logout').hidden = true
    $('login').hidden = false
    $('auth-status').textContent = ''
    renderSets()
  }

  function setTargets (entries) {
    var keys = {}
    entries.forEach(function (e) { keys[setEntryKey(e)] = true })
    return optionalChecks.filter(function (c) { return keys[modKey(c.data)] || keys['name:' + c.data.name.toLowerCase()] })
  }

  function isSetFullyTicked (entries) {
    var targets = setTargets(entries)
    return targets.length > 0 && targets.every(function (c) { return c.input.checked })
  }

  // Highlighted only when the ticked optional mods are exactly the set's mods.
  function isSetSelected (entries) {
    if (!isSetFullyTicked(entries)) return false
    var targets = setTargets(entries)
    return optionalChecks.every(function (c) { return !c.input.checked || targets.indexOf(c) > -1 })
  }

  function refreshSetStates () {
    Array.prototype.forEach.call(document.querySelectorAll('#sets .set-apply'), function (btn) {
      var entries = curatedSets[btn.dataset.set]
      btn.setAttribute('aria-pressed', entries && isSetSelected(entries) ? 'true' : 'false')
    })
  }

  // Selecting a set replaces whatever is ticked; clicking the active set clears everything.
  function toggleSet (entries) {
    var wasSelected = isSetSelected(entries)
    optionalChecks.forEach(function (c) { c.input.checked = false })
    if (!wasSelected) setTargets(entries).forEach(function (c) { c.input.checked = true })
    save()
  }

  function clearOptional () {
    optionalChecks.forEach(function (c) { c.input.checked = false })
    save()
  }

  // ---- output ----

  function rowFor (mod) {
    if (mod.row) return mod.row.outerHTML
    var tr = document.createElement('tr')
    tr.setAttribute('data-type', 'ModContainer')
    var name = document.createElement('td')
    name.setAttribute('data-type', 'DisplayName')
    name.textContent = mod.name
    var src = document.createElement('td')
    var span = document.createElement('span')
    span.className = 'from-steam'
    span.textContent = 'Steam'
    src.appendChild(span)
    var link = document.createElement('td')
    var a = document.createElement('a')
    a.setAttribute('href', STEAM_URL + mod.id)
    a.setAttribute('data-type', 'Link')
    a.textContent = STEAM_URL + mod.id
    link.appendChild(a)
    tr.appendChild(name)
    tr.appendChild(src)
    tr.appendChild(link)
    return tr.outerHTML
  }

  function escapeHtml (s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function buildPreset (name, mods, dlcRows) {
    var safe = escapeHtml(name)
    return '<?xml version="1.0" encoding="utf-8"?>\n<html>\n  <head>\n' +
      '    <meta name="arma:Type" content="preset" />\n' +
      '    <meta name="arma:PresetName" content="' + safe + '" />\n' +
      '    <meta name="generator" content="Arma 3 Launcher - https://arma3.com" />\n' +
      '    <title>Arma 3</title>\n  </head>\n  <body>\n' +
      '    <h1>Arma 3  - Preset <strong>' + safe + '</strong></h1>\n' +
      '    <div class="mod-list">\n      <table>\n' +
      mods.map(rowFor).join('\n') +
      '\n      </table>\n    </div>\n' +
      '    <div class="dlc-list">\n      <table>\n' +
      dlcRows.join('\n') +
      '\n      </table>\n    </div>\n  </body>\n</html>\n'
  }

  function collect () {
    var seen = {}
    var result = []
    baseChecks.concat(optionalChecks).forEach(function (c) {
      if (!c.input.checked) return
      var key = modKey(c.data)
      if (seen[key]) return
      seen[key] = true
      result.push(c.data)
    })
    // Compat patch is needed for every DLC the user does not own.
    dlcButtons.forEach(function (d) {
      if (owned[d.key]) return
      var key = modKey(d.data)
      if (seen[key]) return
      seen[key] = true
      result.push(d.data)
    })
    return result
  }

  // Drop DLC rows the user doesn't own (only those with a button can be marked unowned).
  function collectDlcRows () {
    var seen = {}
    var rows = []
    baseData.dlcs.concat(optionalData.dlcs).forEach(function (d) {
      var key = d.name.toLowerCase()
      if (seen[key]) return
      var button = dlcButtons.filter(function (b) { return DLC_COMPAT[b.key].match.test(d.name) })[0]
      if (button && !owned[button.key]) return
      seen[key] = true
      rows.push(d.row.outerHTML)
    })
    return rows
  }

  function download () {
    var name = $('name').value.trim().replace(/\.html$/i, '') || 'Custom Preset'
    var blob = new Blob([buildPreset(name, collect(), collectDlcRows())], { type: 'text/html' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name.replace(/[^\w\- ]+/g, '_') + '.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  function fetchSets () {
    return fetch('/api/presets/sets', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {} })
      .catch(function () { return {} })
  }

  // The route is behind basic auth, so the browser prompts for credentials on 401.
  function saveSet () {
    var status = $('set-status')
    var name = $('set-name').value.trim()
    var entries = optionalChecks.filter(function (c) { return c.input.checked }).map(function (c) {
      return c.data.id || c.data.name
    })
    if (!name) { status.textContent = 'Enter a set name.'; return }
    if (!entries.length) { status.textContent = 'Tick at least one optional mod.'; return }
    status.textContent = 'Saving...'
    fetch('/api/preset-sets', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, entries: entries })
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error('Not authorised to save sets.')
      if (!r.ok) return r.text().then(function (t) { throw new Error('Save failed (' + r.status + '): ' + t) })
      return fetchSets()
    }).then(function (sets) {
      curatedSets = sets || {}
      renderSets()
      status.textContent = 'Saved.'
    }).catch(function (e) { status.textContent = e.message })
  }

  function fetchList () {
    return fetch('/api/presets').then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var hint = r.status === 401 ? ' (route is behind login: presetsPath missing from config.js?)' : ''
          throw new Error('Could not load presets (' + r.status + ')' + hint + ': ' + t.slice(0, 120))
        })
      }
      return r.json()
    })
  }

  function init () {
    Promise.all([fetchList(), fetchSets()])
      .then(function (results) {
        var files = results[0]
        curatedSets = results[1] || {}
        var isClientside = function (f) { return /clientside/i.test(f) }
        var isServerside = function (f) { return /serverside/i.test(f) }
        var baseFiles = files.filter(function (f) { return !isClientside(f) && !isServerside(f) })
        var clientsideFile = files.filter(isClientside)[0]
        if (!baseFiles.length) {
          $('status').textContent = 'No base presets available.'
          return
        }

        // A share link takes priority over what is stored locally.
        var state = loadFromHash() || loadStored() || { base: null, owned: [], optional: [] }
        state.owned.forEach(function (k) { owned[k] = true })

        var select = $('base')
        baseFiles.forEach(function (f) {
          var o = document.createElement('option')
          o.value = f
          o.textContent = f
          select.appendChild(o)
        })
        if (state.base && baseFiles.indexOf(state.base) > -1) select.value = state.base

        // Follow the selected preset until the user types their own name.
        var nameEdited = false
        var updateDefaultName = function () {
          if (!nameEdited) $('name').value = select.value.replace(/\.html$/i, '') + '_modified'
        }
        $('name').addEventListener('input', function () { nameEdited = true })
        updateDefaultName()

        select.addEventListener('change', function () {
          updateDefaultName()
          renderBase(select.value).then(save)
        })
        $('download').addEventListener('click', download)
        $('share').addEventListener('click', copyShareLink)
        $('save-set').addEventListener('click', saveSet)
        $('login').addEventListener('click', checkAuth)
        $('logout').addEventListener('click', logout)
        $('clear-optional').addEventListener('click', clearOptional)
        // Only re-check silently if this tab logged in before, to avoid an unprompted login dialog.
        try { if (sessionStorage.getItem(ADMIN_FLAG)) checkAuth() } catch (e) { /* storage unavailable */ }
        $('optional-search').addEventListener('input', function () { applyFilter('optional-search', optionalChecks) })
        renderSets()

        return Promise.all([renderBase(select.value), renderOptional(clientsideFile, state.optional)])
          .then(function () {
            $('status').textContent = ''
            save()
          })
      })
      .catch(function (e) { $('status').textContent = e.message })
  }

  init()
})()
