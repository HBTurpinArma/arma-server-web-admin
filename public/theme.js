(function () {
  var key = 'arma-admin-theme'
  var theme = 'dark'

  function apply (value) {
    theme = value
    document.documentElement.setAttribute('data-theme', theme)
    window.dispatchEvent(new window.Event('arma-theme-change'))
  }

  try {
    var saved = window.localStorage.getItem(key)
    if (saved === 'light' || saved === 'dark') theme = saved
  } catch (error) {
    console.error('Unable to read the saved theme:', error)
  }

  window.armaTheme = {
    get: function () { return theme },
    set: function (value) {
      if (value !== 'dark' && value !== 'light') throw new Error('Invalid theme')
      try {
        window.localStorage.setItem(key, value)
      } catch (error) {
        console.error('Unable to save the theme:', error)
        return false
      }
      apply(value)
      return true
    }
  }

  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) {
      apply(event.newValue === 'light' ? 'light' : 'dark')
    }
  })

  apply(theme)
}())
