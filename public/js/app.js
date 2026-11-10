require('jquery.iframe-transport')

require('bootstrap/dist/css/bootstrap.css')
require('ladda/dist/ladda-themeless.min.css')
require('sweetalert/dist/sweetalert.css')
require('sweetalert/dist/sweetalert.css')
require('../css/styles.css')
require('../css/preset-theme.css')

require.config({

  baseUrl: 'js/lib',

  paths: {
    app: '../app',
    tpl: '../tpl'
  },

  shim: {
    backbone: {
      deps: ['underscore', 'jquery'],
      exports: 'Backbone'
    },
    'backbone.babysitter': {
      deps: ['backbone']
    },
    'backbone.bootstrap-modal': {
      deps: ['backbone', 'bootstrap']
    },
    bootstrap: {
      deps: ['jquery']
    },
    ladda: {
      deps: ['bootstrap']
    },
    marionette: {
      deps: ['backbone', 'backbone.babysitter'],
      exports: 'Marionette'
    },
    'marionette-formview': {
      deps: ['marionette']
    },
    sweetalert: {
      deps: ['bootstrap']
    },
    underscore: {
      exports: '_'
    }
  }
})

require(['jquery', 'bootstrap', 'backbone', 'app/router'], function ($, Bootstrap, Backbone, Router) {
  $(document).ajaxError(function (event, response) {
    if (response.status === 401) window.location.assign('/login')
  })
  return new Router()
})
