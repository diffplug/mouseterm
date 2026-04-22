// The packaged Tauri sidecar must ship a local copy of the clipboard ops, so
// this CommonJS shim points other Node consumers at that shared implementation.
module.exports = require('../standalone/sidecar/clipboard-ops.js');
