/** Dependency-free Chrome DevTools client for the isolated local acceptance browser. */
export async function browser(port = 9227) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new globalThis.WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) p?.reject(new Error(data.error.message));
      else p?.resolve(data.result);
    } else for (const fn of listeners) fn(data);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  async function tab(url = 'about:blank', options = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', ...options });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable');
    // Model visible independent windows deterministically in headless Chrome.
    // Cookie/network policy stays browser-enforced; this does not prove background visibility.
    await call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await call('Runtime.enable');
    await call('Network.enable');
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description,
        );
      return result.result.value;
    };
    const navigate = async (target) => {
      await call('Page.navigate', { url: target });
      await wait(async () => await evaluate('document.readyState === "complete"'), 15000);
    };
    if (url !== 'about:blank') await navigate(url);
    return {
      id: targetId,
      sessionId,
      call,
      evaluate,
      navigate,
      close: () => send('Target.closeTarget', { targetId }),
    };
  }
  return {
    send,
    tab,
    listen: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close: () => ws.close(),
    version: version.Browser,
  };
}
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function wait(condition, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await delay(80);
  }
  throw new Error('Condition timed out');
}
