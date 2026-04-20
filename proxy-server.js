/**
 * Local CORS Proxy for BNW3W API
 * Run: node proxy-server.js
 * Listens on http://localhost:3001
 * Forwards ALL headers ke target tanpa modifikasi
 */

const http  = require('http');
const https = require('https');

const PORT   = 3001;
const TARGET_HOST = 'www.bnw3w.com';

const server = http.createServer((req, res) => {

  // CORS — izinkan semua origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Kumpulkan body dari browser
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // Bangun headers yang akan dikirim ke Binance
    const forwardHeaders = { ...req.headers };
    forwardHeaders['host']             = TARGET_HOST;
    forwardHeaders['content-length']   = body.length;

    // Hapus header yang di-inject browser/proxy agar tidak bentrok
    delete forwardHeaders['origin'];          // akan di-set ulang dari custom header browser kirim
    delete forwardHeaders['referer'];
    delete forwardHeaders['connection'];

    // Kembalikan origin dari nilai x-custom-origin jika dikirim (opsional)
    if (req.headers['x-forward-origin']) {
      forwardHeaders['origin']  = req.headers['x-forward-origin'];
      forwardHeaders['referer'] = req.headers['x-forward-origin'] + '/';
      delete forwardHeaders['x-forward-origin'];
    }

    const options = {
      hostname: TARGET_HOST,
      port:     443,
      path:     req.url,
      method:   req.method,
      headers:  forwardHeaders,
    };

    const proxyReq = https.request(options, proxyRes => {
      // Tambahkan CORS ke response dari Binance
      const responseHeaders = { ...proxyRes.headers };
      responseHeaders['access-control-allow-origin']  = '*';
      responseHeaders['access-control-expose-headers'] = '*';

      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', err => {
      console.error('[proxy error]', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Local proxy berjalan di http://localhost:${PORT}`);
  console.log(`   Target: https://${TARGET_HOST}`);
  console.log(`   Contoh: http://localhost:${PORT}/bapi/defi/v1/public/wallet-direct/extension-wallet/swap/aggregator/swap/get-quote\n`);
});
