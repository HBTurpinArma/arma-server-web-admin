# Arma Server Admin

[![Build Status](https://travis-ci.org/Dahlgren/arma-server-web-admin.svg?branch=master)](https://travis-ci.org/Dahlgren/arma-server-web-admin)

A simple to use web admin panel for Arma servers.

[Screenshots](http://imgur.com/a/Xod6U)

## Features

- Create multiple instances of game servers in the same admin panel
- See server status queryed from the instances with current mission and players
- View and download game logs, with separate lists for `.rpt` and `.log` files
- Refresh either log section to reload both lists from the server
- Upload missions from your local computer and from Steam Workshop to the server
- Download and update mods from withSIX

## Requirements

- Node.js, https://nodejs.org/
- Pre-installed Arma Server

## Supported Platforms

- Windows
- Linux
- Linux with Windows binary using Wine

## Supported Games

- arma1
- arma2
- arma2oa
- arma3
- arma3_x64
- cwa (does not support linux)
- ofp
- ofpresistance

## Config

Key | Description
--- | ---
games | Game configurations keyed by game ID, including server, mod and mission paths
logsPath | Folder containing server logs
port | Web port to use
host | IP or Hostname to listen on
type | Which kind of server to use, can be 'linux', 'windows' or 'wine'
additionalConfigurationOptions | Additional configuration options appended to server.cfg file
parameters | Extra startup parameters added to servers and headless clients
serverMods | Mods that always and only will be used by the game servers
auth | Array of accounts used to sign in
sessionSecureCookies | Set to `true` when using HTTPS through a trusted reverse proxy; trusts one proxy hop
accountsPath | Optional path to the accounts JSON file; defaults to `accounts.json` in the application directory
auditLogPath | Optional path for the persistent panel audit log; defaults to `panel-audit.log` in the application directory
presetsPath | Optional folder containing public Arma Launcher `.html` presets; the Mods page lists these files
branding | Optional browser/page branding: `title`, `navigationTitle`, and `icon` URL (for example `/favicon.png`; place the icon in `public/`)
modUpdater | Optional updater configuration: `python`, absolute mod `script` and optional `gameScript`, `cwd` and `gameCwd` paths
prefix | Text prepended to all game servers name
suffix | Text appended to all game servers name

## How to Use

1. Copy `config.js.example` to `config.js`

2. Change values in `config.js` as described above or in the file

3. Install all dependencies with `npm install`

4. Launch the web UI with `npm start` or install as a Windows Service with `npm run install-windows-service`

Mission `.pbo` files in configured mission folders are publicly downloadable without
signing in at `/api/missions/<filename>/<game-id>`. The game ID is optional and
defaults to `arma3`; URL-encode the filename and game ID. Anyone with a file's
name can download it, so do not place private missions in these folders. Mission
listing and changes still require authentication and the appropriate permissions.

Dark mode is enabled by default. Use **Settings > Dark Mode** to switch themes;
the choice is saved in browser storage and shared by the sign-in page and Preset
Builder on the same origin.

The configured local branding icon is publicly accessible so it also appears on
the sign-in page. Use a valid `.ico`, `.png`, or other browser-supported image,
restart the app after changing the branding configuration, and refresh the browser.

To enable **Update Mods** and **Update Game**, configure `modUpdater` as shown in
`config.js.example`, restart the app, and grant **Mods Update** and/or **Servers
Update** in Account Management. Accounts previously granted **Mods Update Game**
retain that permission; editing and saving an account moves it to the Servers group.
Each script runs as the application service user, without a shell or
arguments, with its working directory defaulting to the script's directory.
The configured Python executable must be accessible to that user. The updater
requires authentication even if the rest of the app runs without it. Only one
mod or game update runs at a time; it continues when you leave the page. The shared
output is visible only to users with permission for the active or most recent
update. Output is retained
in memory (up to the last 256K characters) until another update or app restart.
Python output is unbuffered, though subprocesses started by the script may still
buffer their own output. Successful updates trigger an installed-mods refresh.
Only grant this permission to users trusted to run the configured script and view
its output; avoid printing credentials or secrets.

An existing single-account `auth` object continues to work for sign-in and,
without explicit permissions, retains access to server, mission, mod and log
operations. Account management requires the accounts array to be loaded from
`accounts.json`.

## Panel audit log

Users with **Accounts > Audit Log** permission can open **Settings > Audit Log** to
review and search panel changes by user and action (HTTP method or request path),
including the user, time, request, response status and selected target names. Failed
requests that reach the authenticated API and interrupted connections are included; a successful response to a
background operation records that it was accepted, not its eventual result.
View requests and sign-in/sign-out are excluded. When authentication is disabled,
changes are recorded as unauthenticated and the audit page is inaccessible until
an authorized user signs in. Existing account managers retain audit access until
their explicit Audit Log permission is changed; new accounts do not receive it by
default. Account managers can grant or revoke it independently of account management.
Request bodies, passwords and query strings are not
stored. The JSON Lines file is retained indefinitely: ensure the service user can
write to `auditLogPath`, protect it with filesystem permissions, and monitor disk
space. Write failures are reported in the server console and, where possible, an
`X-Audit-Log-Error` response header; the underlying change may already have occurred.

## Account management

Copy `accounts.json.example` to `accounts.json` and change the example credentials.
To bootstrap an account manager, add `"accounts": { "manage": true }` inside that
account's `permissions` object, then restart the application. Account managers can
open **Accounts** to create, edit, or delete accounts and assign individual
permissions. Existing accounts without this permission cannot manage accounts.
Use **Copy** beside an account to start a new account with the same available
permissions; choose a new username and password. At least one account manager must
remain.

Accounts with **Presets Edit** permission can upload launcher `.html` presets from
the Mods page (up to 5 MiB per file). Uploading a file with an existing filename
replaces it after confirmation. Presets in `presetsPath` are publicly accessible.
Select a preset filename in the Mods page to download the HTML file and open it
locally. Only open preset files from sources you trust: downloaded HTML can run
scripts in your browser.
**Presets Delete** separately permits deleting launcher preset files from the Mods
page; existing accounts do not have this permission until an account manager grants
it. Deleting curated preset sets remains controlled by **Presets Edit**.
The mission and preset Upload buttons, server Save, and server, mission, log, and
preset Delete buttons remain visible but are disabled when the signed-in account
lacks the corresponding permission. The server, mission, mod and log pages require
their respective **View** permissions. Mission and mod tabs in the server editor
also require those permissions; saving other settings preserves inaccessible
mission and mod selections.
Permission checks on the server remain authoritative.

The page can generate a 16-character random password containing uppercase,
lowercase, numbers, and symbols; copy it before saving because existing
passwords are not displayed. Changing your own credentials may require signing in
again. Changes to authentication and account permissions apply on subsequent
requests and are saved to the accounts file. If that file
is edited externally while the application is running, restart before using the
page so external changes are not overwritten. If using a custom file, set
`accountsPath` to the same file loaded into `auth`.

Passwords are stored as plaintext. Protect the file with appropriate filesystem
permissions and use HTTPS (for example through a trusted reverse proxy); do not
expose the HTTP service directly to untrusted networks. Set
`sessionSecureCookies: true` when using HTTPS through a trusted reverse proxy.
The application trusts one proxy hop with this setting, so only allow the proxy
to reach the application port. Sessions are held in memory, expire after eight
hours, and are lost when the application restarts. Logging out invalidates the
current session; other signed-in devices remain signed in. Existing integrations
using HTTP Basic authentication must switch to the session login endpoint.

**Permission limitation:** View permissions restrict the corresponding pages, APIs,
and live lists, but do not enforce complete data isolation. For example, server
configuration can include selected missions and mods. Do not use these permissions
as a security boundary for untrusted users.
The existing `servers.rcon` field is not currently enforced by a route and is not
offered as an account-management option.

## System Configuration

### Windows

Make sure to disable Windows Error Reporting or server control will be stuck on a server crash.

Install as a Windows Service with `npm run install-windows-service`.

Remove previously installed Windows Service with `npm run uninstall-windows-service`.

### Wine

Make sure to disable Wine GUI Crash Dialog or server control will be stuck on a server crash.
This is easiest solved using `winetricks` by running `winetricks nocrashdialog`.
It can also be disabled manually.
[Read more at Wine FAQ](http://wiki.winehq.org/FAQ#head-c857c433cf9fc1dcd90b8369ef75c325483c91d6).
