/** Loopback-only acceptance fault proxy. Real API responses/cookies, never synthetic Cart payloads. */
import http from 'node:http';
import { Buffer } from 'node:buffer';
let mode = 'none';
const held = [];
const events = [];
const server = http.createServer(async (req, res) => {
  if (!['localhost:3000', '127.0.0.1:3000'].includes(req.headers.host))
    return res.writeHead(403).end();
  if (req.url.startsWith('/__cart01br/')) {
    if (req.url === '/__cart01br/release') {
      for (const release of held.splice(0)) release();
    } else if (req.url.startsWith('/__cart01br/mode/')) mode = req.url.split('/').at(-1);
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ mode, held: held.length, events }));
  }
  const api = req.url.startsWith('/api/');
  const path = api ? req.url.slice(4) : req.url;
  const cart = api && path.startsWith('/storefront/v1/carts');
  const init = cart && req.method === 'POST' && path === '/storefront/v1/carts';
  const mutation = cart && ['POST', 'PATCH', 'DELETE'].includes(req.method) && !init;
  let fault = 'none';
  if (
    (mode === 'hold-init' && init) ||
    (mode === 'lose-mutation' && mutation) ||
    (mode === 'hold-mutation' && mutation) ||
    (['hold-read', 'limit-read'].includes(mode) && cart && req.method === 'GET') ||
    (mode === 'hang-mutation' && mutation) ||
    (mode === 'fail-mutation' && mutation)
  ) {
    fault = mode;
    mode = 'none';
  }
  if (fault === 'fail-mutation' || fault === 'limit-read') {
    const rateLimited = fault === 'limit-read';
    const code = rateLimited ? 429 : 503;
    events.push({
      method: req.method,
      path,
      status: code,
      fault,
      key: req.headers['idempotency-key'] ?? null,
      context: req.headers['x-cart-context'] ?? null,
    });
    res.writeHead(code, {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'retry-after': '2',
    });
    return res.end(
      JSON.stringify({
        error: {
          code: rateLimited ? 'RATE_LIMITED' : 'UNAVAILABLE',
          message: 'Synthetic service interruption',
        },
      }),
    );
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: api ? 3002 : 3004,
      path,
      method: req.method,
      headers: { ...req.headers, 'accept-encoding': 'identity' },
    },
    (response) => {
      const parts = [];
      response.on('data', (p) => parts.push(p));
      response.on('end', () => {
        if (cart)
          events.push({
            method: req.method,
            path,
            status: response.statusCode,
            fault,
            key: req.headers['idempotency-key'] ?? null,
            context: req.headers['x-cart-context'] ?? null,
          });
        const send = () => {
          if (fault === 'lose-mutation') {
            res.writeHead(200, {
              'content-type': 'application/json',
              'content-length': '99999',
              'cache-control': 'private, no-store',
            });
            res.write('{"data":');
            setTimeout(() => res.destroy(), 20);
            return;
          }
          res.writeHead(response.statusCode, response.headers);
          res.end(Buffer.concat(parts));
        };
        if (fault.startsWith('hold-') || fault === 'hang-mutation') held.push(send);
        else send();
      });
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Local upstream unavailable');
  });
  req.pipe(upstream);
});
server.listen(3000, '127.0.0.1', () =>
  console.log('Cart01BR acceptance proxy ready on loopback3000'),
);
