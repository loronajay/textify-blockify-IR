'use strict';

const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TB2_DIR = path.join(__dirname, '..');

app.use(express.json({ limit: '4mb' }));

// CORS for all routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tb2-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Claude CORS proxy — key arrives as x-tb2-api-key, forwarded as x-api-key to Anthropic
// The key is never stored; it goes straight from the request header to Anthropic.
app.post('/proxy/claude', (req, res) => {
  const apiKey = req.headers['x-tb2-api-key'];
  if (!apiKey) {
    return res.status(400).json({ error: 'Missing x-tb2-api-key header' });
  }

  const body = JSON.stringify(req.body);
  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body)
    }
  };

  const proxyReq = https.request(options, proxyRes => {
    res.status(proxyRes.statusCode);
    const ct = proxyRes.headers['content-type'];
    if (ct) res.setHeader('content-type', ct);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    if (!res.headersSent) res.status(502).json({ error: `Upstream error: ${err.message}` });
  });

  proxyReq.write(body);
  proxyReq.end();
});

// Static extension files with CORS headers (already set above)
app.get('/blockify-turbowarp-2.embedded.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(TB2_DIR, 'blockify-turbowarp-2.embedded.js'));
});

app.get('/textify-turbowarp-2.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(TB2_DIR, 'textify-turbowarp-2.js'));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`TB2 host server on port ${PORT}`));
