import type { Terminal, IDisposable } from '@xterm/xterm';
import { setBracketedPaste, setMouseReporting } from './mouse-selection';

/**
 * Wire an xterm terminal's mouse-tracking and bracketed-paste modes into the
 * mouse-selection store.
 *
 * Installs CSI handlers for DECSET (`CSI ? ... h`) and DECRST (`CSI ? ... l`)
 * that return false, letting xterm's built-in handler still process the
 * sequence. After xterm updates its internal state we sync our store from
 * the public `terminal.modes` getters in a microtask (the parser handler
 * runs synchronously before xterm's, so `modes` isn't updated yet when our
 * callback first fires).
 */
export function attachMouseModeObserver(id: string, terminal: Terminal): IDisposable {
  const sync = () => {
    queueMicrotask(() => {
      setMouseReporting(id, terminal.modes.mouseTrackingMode);
      setBracketedPaste(id, terminal.modes.bracketedPasteMode);
    });
  };

  const onSet = terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, () => {
    sync();
    return false;
  });
  const onReset = terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, () => {
    sync();
    return false;
  });

  return {
    dispose() {
      onSet.dispose();
      onReset.dispose();
    },
  };
}
