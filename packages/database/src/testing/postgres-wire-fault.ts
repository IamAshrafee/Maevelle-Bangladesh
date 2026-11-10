import { createServer, connect, type Socket } from 'node:net';

/** Plaintext loopback-only PostgreSQL protocol fault, never a general proxy. */
export async function postgresCommitFault(raw: string, mode: 'BEFORE_COMMIT' | 'AFTER_COMMIT') {
  const target = new URL(raw);
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    !/^\/maevelle_cart01a_[a-z0-9_]+$/.test(target.pathname)
  )
    throw new Error('Physical fault requires a random disposable local database.');
  const sockets = new Set<Socket>();
  const evidence = { intercepted: false, serverCommitSeen: false };
  const server = createServer((client) => {
    const upstream = connect({ host: target.hostname, port: Number(target.port || 5432) });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
    }
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    let clientBuffer = Buffer.alloc(0),
      serverBuffer = Buffer.alloc(0),
      startup = true,
      awaitingCommit = false;
    client.on('data', (chunk) => {
      clientBuffer = Buffer.concat([clientBuffer, chunk]);
      while (clientBuffer.length >= (startup ? 4 : 5)) {
        const length = clientBuffer.readInt32BE(startup ? 0 : 1) + (startup ? 0 : 1);
        if (length < 4 || length > 1048576) {
          client.destroy();
          upstream.destroy();
          return;
        }
        if (clientBuffer.length < length) return;
        const packet = clientBuffer.subarray(0, length);
        clientBuffer = clientBuffer.subarray(length);
        const commit =
          !startup &&
          packet[0] === 81 &&
          packet.subarray(5, -1).toString().trim().toUpperCase() === 'COMMIT';
        startup = false;
        if (commit && !evidence.intercepted) {
          evidence.intercepted = true;
          if (mode === 'BEFORE_COMMIT') {
            client.destroy();
            upstream.destroy();
            return;
          }
          awaitingCommit = true;
        }
        upstream.write(packet);
      }
    });
    upstream.on('data', (chunk) => {
      serverBuffer = Buffer.concat([serverBuffer, chunk]);
      while (serverBuffer.length >= 5) {
        const length = serverBuffer.readInt32BE(1) + 1;
        if (serverBuffer.length < length) return;
        const packet = serverBuffer.subarray(0, length);
        serverBuffer = serverBuffer.subarray(length);
        if (awaitingCommit && packet[0] === 67 && packet.subarray(5, -1).toString() === 'COMMIT') {
          evidence.serverCommitSeen = true;
          client.destroy();
          upstream.destroy();
          return;
        }
        client.write(packet);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local proxy address');
  const url = new URL(raw);
  url.hostname = '127.0.0.1';
  url.port = String(address.port);
  url.searchParams.set('sslmode', 'disable');
  return {
    url: url.href,
    evidence,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
