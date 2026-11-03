/** Local synthetic browser fault injector. Run Next on 3004; this loopback proxy owns 3000.
 * No remote upstreams, real credentials, or application-source modifications.
 */
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('/tmp/maevelle-phase07a/fixture.json', 'utf8'));
const injection = `<script>(()=>{
let mode='none';
const originalSet=Storage.prototype.setItem,originalGet=Storage.prototype.getItem,originalFetch=window.fetch.bind(window);
Storage.prototype.setItem=function(k,v){if(mode==='quota'&&this===localStorage&&k.startsWith('maevelle_wishlist_'))throw new DOMException('Synthetic quota','QuotaExceededError');if(mode==='session-denied'&&this===sessionStorage)throw new DOMException('Synthetic denied','SecurityError');return originalSet.call(this,k,v)};
Storage.prototype.getItem=function(k){if(mode==='denied'&&this===localStorage)throw new DOMException('Synthetic denied','SecurityError');if(mode==='session-denied'&&this===sessionStorage)throw new DOMException('Synthetic denied','SecurityError');return originalGet.call(this,k)};
window.fetch=async(...args)=>{const url=String(args[0]);if(mode==='offline'&&url.includes('/api/'))throw new TypeError('Synthetic offline');const result=await originalFetch(...args);if(mode==='lost-create'&&/wishlist\\/(account-shares|shares)$/.test(url)){mode='none';throw new TypeError('Synthetic lost committed response')}return result};
addEventListener('DOMContentLoaded',()=>{const box=document.createElement('aside');box.setAttribute('aria-label','Local acceptance controls');box.style.cssText='position:fixed;bottom:0;left:0;z-index:99999;background:white;color:black;border:2px solid black;font:12px sans-serif;max-width:100%;padding:4px';
const select=document.createElement('select');select.setAttribute('aria-label','Injected browser failure');for(const item of ['none','quota','denied','session-denied','offline','lost-create']){const o=document.createElement('option');o.value=item;o.textContent=item;select.appendChild(o)}select.onchange=()=>{mode=select.value};box.appendChild(select);
for(const actor of ['shopper-a','shopper-b','analyst','no-analytics','other-analyst']){const a=document.createElement('a');a.href='/__acceptance/login/'+actor;a.textContent=' '+actor+' ';box.appendChild(a)}
const clear=document.createElement('button');clear.textContent='Inject corrupt journal';clear.onclick=()=>originalSet.call(localStorage,'maevelle_wishlist_op_v2:corrupt','invalid-json');box.appendChild(clear);
document.body.appendChild(box)});
})();</script>`;
const server = http.createServer(async (req, res) => {
  if (
    !['wishlist-07a.localhost:3000', '127.0.0.1:3000', 'localhost:3000'].includes(req.headers.host)
  ) {
    res.writeHead(403).end();
    return;
  }
  if (req.url?.startsWith('/__acceptance/login/')) {
    const actor = req.url.split('/').at(-1);
    if (!['shopper-a', 'shopper-b', 'analyst', 'no-analytics', 'other-analyst'].includes(actor)) {
      res.writeHead(400).end();
      return;
    }
    const shopper = actor.startsWith('shopper');
    const response = await fetch(
      'http://127.0.0.1:3002/' + (shopper ? 'shopper-auth' : 'auth') + '/sign-in/email',
      {
        method: 'POST',
        headers: {
          origin: shopper
            ? 'http://wishlist-07a.localhost:3000'
            : 'http://wishlist-07a.localhost:3001',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: actor + '-07a@example.test', password: fixture.password }),
      },
    );
    if (!response.ok) {
      res.writeHead(502).end('Synthetic sign-in failed ' + response.status);
      return;
    }
    res
      .writeHead(302, {
        'set-cookie': response.headers.getSetCookie(),
        location: shopper ? '/wishlist' : '/admin/analytics?view=wishlist',
        'cache-control': 'no-store',
      })
      .end();
    return;
  }
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: 3004,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, 'accept-encoding': 'identity' },
    },
    (response) => {
      const headers = { ...response.headers };
      if (String(headers['content-type']).includes('text/html')) {
        const chunks = [];
        response.on('data', (part) => chunks.push(part));
        response.on('end', () => {
          delete headers['content-length'];
          delete headers['transfer-encoding'];
          res.writeHead(response.statusCode, headers);
          res.end(
            Buffer.concat(chunks)
              .toString()
              .replace('</body>', injection + '</body>'),
          );
        });
      } else {
        res.writeHead(response.statusCode, headers);
        response.pipe(res);
      }
    },
  );
  upstream.on('error', () => {
    res.writeHead(502).end('Local Next server unavailable');
  });
  req.pipe(upstream);
});
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => socket.destroy());
  const upstream = http.request({
    host: '127.0.0.1',
    port: 3004,
    path: req.url,
    headers: req.headers,
  });
  upstream.on('upgrade', (response, remote, remoteHead) => {
    remote.on('error', () => remote.destroy());
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(response.headers)
          .map(([key, value]) => key + ': ' + value)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (remoteHead.length) socket.write(remoteHead);
    if (head.length) remote.write(head);
    remote.pipe(socket);
    socket.pipe(remote);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
server.listen(3000, '127.0.0.1', () => console.log('Loopback browser acceptance proxy ready'));
