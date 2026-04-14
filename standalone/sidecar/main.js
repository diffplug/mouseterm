/**
 * Tauri sidecar entry point — stdio JSON-lines transport over pty-core.
 *
 * Protocol:
 *   stdin  ← JSON lines from Rust backend (commands)
 *   stdout → JSON lines to Rust backend (events)
 */

const readline = require('readline');
const nodePty = require('node-pty');
const { create } = require('./pty-core');

const mgr = create((event, data) => {
  process.stdout.write(JSON.stringify({ event: `pty:${event}`, data }) + '\n');
}, nodePty);

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  try {
    const { event, data } = JSON.parse(line);
    switch (event) {
      case 'pty:spawn':   mgr.spawn(data.id, data.options); break;
      case 'pty:input':   mgr.write(data.id, data.data); break;
      case 'pty:resize':  mgr.resize(data.id, data.cols, data.rows); break;
      case 'pty:kill':    mgr.kill(data.id); break;
      case 'pty:requestInit': mgr.list(); break;
      case 'pty:getCwd':  mgr.getCwd(data.id, data.requestId); break;
      case 'pty:getScrollback': mgr.getScrollback(data.id, data.requestId); break;
      case 'pty:getShells':  mgr.getShells(data.requestId); break;
      case 'pty:gracefulKillAll': mgr.gracefulKillAll(data.timeout); break;
      default: console.error(`[sidecar] Unknown event: ${event}`);
    }
  } catch (err) {
    console.error(`[sidecar] Failed to parse message:`, err.message);
  }
});

rl.on('close', () => { mgr.killAll(); process.exit(0); });
process.on('SIGTERM', () => { mgr.killAll(); process.exit(0); });
