var fs = require('fs')
var fsExtra = require('fs.extra')
var _ = require('lodash')
var glob = require('glob')
var os = require('os')
var path = require('path')

const requiredFileExtensions = [
  '.dll',
  '.exe',
  '.so',
  '.txt' // Steam app id
]

const serverFolders = [
  'addons',
  'aow',
  'argo',
  'contact',
  'csla',
  'curator',
  'dll',
  'dta',
  'enoch',
  'expansion',
  'gm',
  'heli',
  'jets',
  'kart',
  'linux64',
  'mark',
  'mpmissions',
  'orange',
  'tacops',
  'tank',
  'vn',
  'ws'
]

function copyKeys (config, serverFolder, mods) {
  // Copy needed keys, file symlinks on Windows are sketchy
  const keysFolder = path.join(serverFolder, 'keys')
  return fs.promises.mkdir(keysFolder, { recursive: true })
    .then(() => {
      const defaultKeysPath = path.join(config.path, 'keys')
      const defaultKeysPromise = fs.promises.readdir(defaultKeysPath)
        .then((files) => files.filter((file) => path.extname(file) === '.bikey'))
        .then((files) => files.map((file) => path.join(defaultKeysPath, file)))

      const modKeysPromise = Promise.all(mods.map(mod => {
        return new Promise((resolve, reject) => {
          const modPath = path.join(config.path, mod)
          glob(`${modPath}/**/*.bikey`, function (err, files) {
            //console.log('Creating key: ', files)
            if (err) {
              return reject(err)
            }
            return resolve(files)
          })
        })
      })).then((modsFiles) => modsFiles.flat())
      
      return Promise.all([defaultKeysPromise, modKeysPromise].map((promise) => {
        return promise.then((keyFiles) => {
          return Promise.all(keyFiles.map((keyFile) => {
            return fs.promises.copyFile(keyFile, path.join(keysFolder, path.basename(keyFile)))
          }))
        })
      })).catch((err) => {
        console.error('Error copying keys:', err)
      })
    })
}

function copyFiles (config, serverFolder) {
  const configFileExtensions = (config.virtualServer && config.virtualServer.fileExtensions) || []
  const allowedFileExtensions = _.uniq(requiredFileExtensions.concat(configFileExtensions))

  return fs.promises.readdir(config.path)
    .then((files) => {
      // Copy needed files, file symlinks on Windows are sketchy
      const serverFiles = files.filter((file) => allowedFileExtensions.indexOf(path.extname(file)) >= 0 || path.basename(file) === 'arma3server' || path.basename(file) === 'arma3server_x64')
      return Promise.all(serverFiles.map((file) => {
        return fs.promises.copyFile(path.join(config.path, file), path.join(serverFolder, file))
      }))
    })
}


function writeBattleEyeConfig (port, password, filepath){
  //Create cfg files with the server's RCON port/password.
  fs.writeFile(path.join(filepath,"beserver_x64.cfg"), "RConPassword "+password+"\n"+"RConPort "+port, function(err) {
    if(err) { 
      return console.log('Error creating BattlEye config:',err); 
    }
  }); 
  fs.writeFile(path.join(filepath,"beserver.cfg"), "RConPassword "+password+"\n"+"RConPort "+port, function(err) {
    if(err) { 
      return console.log('Error creating BattlEye config:',err); 
    }
  }); 
}


function copyBattleEye (config, serverFolder, rcon_port, rcon_password) {
  const beFolder = path.join(serverFolder, 'BattlEye')
  const profileFolder = path.join(serverFolder, 'profiles/BattlEye')
  return fs.promises.mkdir(beFolder, { recursive: true }).then(() => {
    const defaultBattlEyePath = path.join(config.path, 'BattlEye')
    const defaultBattlEyePromise = fs.promises.readdir(defaultBattlEyePath)
      .then((files) => files.filter((file) => path.extname(file) != '.cfg'))
      .then((files) => files.map((file) => path.join(defaultBattlEyePath, file)))

      writeBattleEyeConfig(rcon_port, rcon_password, beFolder)

      return Promise.all([defaultBattlEyePromise].map((promise) => {
        return promise.then((beFiles) => {
          return Promise.all(beFiles.map((beFile) => {
            return fs.promises.copyFile(beFile, path.join(beFolder, path.basename(beFile)))
          }))
        })
      })).catch((err) => {
        console.error('Error copying BattlEye file:', err)
      })
  })
}

function copyUserConfig (config, serverFolder, cbaConfigurationOptions) {
  const ucFolder = path.join(serverFolder, 'userconfig')
  return fs.promises.mkdir(ucFolder, { recursive: true }).then(() => {
    const defaultUserConfigPath = path.join(config.path, 'userconfig')
    const defaultUserConfigPromise = fs.promises.readdir(defaultUserConfigPath)
      .then((files) => files.map((file) => path.join(defaultUserConfigPath, file)))

      fs.appendFile(path.join(ucFolder,"cba_settings.sqf"), cbaConfigurationOptions || "", function(err) {
        if(err) { 
          return console.log('Could not override cba_Settings.sqf',err); 
        }
      }); 

      return Promise.all([defaultUserConfigPromise].map((promise) => {
        return promise.then((ucFiles) => {
          return Promise.all(ucFiles.map((ucFile) => {
            return fs.promises.copyFile(ucFile, path.join(ucFolder, path.basename(ucFile)))
          }))
        })
      })).catch((err) => {
        console.error('Error copying userconfig file:', err)
      })
  })
}

function createModFolders (config, serverFolder, mods) {
  // Create virtual folders from default Arma and mods
  const configFolders = (config.virtualServer && config.virtualServer.folders) || []
  const serverMods = config.serverMods || []
  const symlinkFolders = _.uniq(serverFolders
    .concat(mods)
    .concat(configFolders)
    .concat(serverMods)
    .map(function (folder) {
      return folder.split(path.sep)[0]
    })
  )

  return Promise.all(symlinkFolders.map((symlink) => {
    return fs.promises.access(path.join(config.path, symlink))
      .then(() => {
        return fs.promises.symlink(path.join(config.path, symlink), path.join(serverFolder, symlink), 'junction')
          .catch((err) => {
            console.error('Could create symlink for', symlink, 'due to', err)
          })
      })
      .catch(() => {})
  }))
}

module.exports.create = function (config, server) {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'arma-server-'))
    .then((serverFolder) => {
      console.log('Created virtual server folder:', serverFolder)
      console.log(server)
      return Promise.all([
        copyKeys(config, serverFolder, server.mods),
        copyKeys(config, serverFolder, server.mods_optional),
        copyFiles(config, serverFolder),
        copyBattleEye(config, serverFolder, server.rcon_port, server.rcon_password),
        copyUserConfig(config, serverFolder, server.cbaConfigurationOptions), //CBA * Other Mod Settings
        createModFolders(config, serverFolder, server.mods)
      ]).then(() => {
        return serverFolder
      })
    })
}

module.exports.remove = function (folder, cb) {
  if (folder) {
    fsExtra.rmrf(folder, function (err) {
      if (err) {
        console.log('Error removing virtual server folder', err)
      }


      if (cb) {
        cb(err)
      }

    })
  }
}
