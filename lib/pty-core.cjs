// The packaged Tauri sidecar must ship a local copy of the PTY core, so this
// CommonJS shim points other Node consumers at that shared implementation.
module.exports = require('../standalone/sidecar/pty-core.js');
