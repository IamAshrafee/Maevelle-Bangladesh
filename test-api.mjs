import http from 'http';

const data = JSON.stringify({ displayName: 'Test Customer 4' });

const options = {
  hostname: '127.0.0.1',
  port: 8080,
  path: '/admin/api/admin/customers',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', body));
});

req.on('error', console.error);
req.write(data);
req.end();
