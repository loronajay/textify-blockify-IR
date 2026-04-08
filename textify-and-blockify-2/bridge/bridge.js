'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function createBridge({ port = 7331, timeout = 5000 } = {}) {
  let twSocket = null;
  const pendingRequests = new Map(); // requestId → { resolve, reject, timer }
  const proposals = new Map();       // proposalId → 'pending' | 'approved' | 'rejected'
  let requestCounter = 0;
  let proposalCounter = 0;

  function generateRequestId() {
    return `req-${++requestCounter}`;
  }

  function generateProposalId() {
    return `p-${++proposalCounter}`;
  }

  function sendToTW(message) {
    return new Promise((resolve, reject) => {
      if (!twSocket || twSocket.readyState !== WebSocket.OPEN) {
        const err = new Error('TurboWarp not connected');
        err.code = 503;
        reject(err);
        return;
      }
      const id = generateRequestId();
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        const err = new Error('TurboWarp did not respond in time');
        err.code = 504;
        reject(err);
      }, timeout);
      pendingRequests.set(id, { resolve, reject, timer });
      twSocket.send(JSON.stringify({ id, ...message }));
    });
  }

  function handleWsMessage(data) {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }

    if (msg.type === 'proposalApproved') {
      proposals.set(msg.proposalId, 'approved');
      return;
    }
    if (msg.type === 'proposalRejected') {
      proposals.set(msg.proposalId, 'rejected');
      return;
    }

    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      pending.resolve(msg);
    }
  }

  async function route(req, parsedUrl) {
    const method = req.method;
    const path = parsedUrl.pathname;

    if (method === 'GET' && path === '/status') {
      return {
        ok: true,
        bridge: 'running',
        turbowarp: (twSocket && twSocket.readyState === WebSocket.OPEN) ? 'connected' : 'disconnected'
      };
    }

    if (method === 'GET' && path === '/state') {
      const res = await sendToTW({ type: 'getState' });
      if (!res.ok) {
        const err = new Error(res.error || 'Unknown error');
        err.code = 500;
        throw err;
      }
      return { ok: true, ir: res.ir, editingTarget: res.editingTarget };
    }

    const spriteMatch = path.match(/^\/sprite\/(.+)$/);
    if (method === 'GET' && spriteMatch) {
      const name = decodeURIComponent(spriteMatch[1]);
      const res = await sendToTW({ type: 'getSprite', name });
      if (!res.ok) {
        const err = new Error(res.error || 'Unknown error');
        err.code = 404;
        throw err;
      }
      return { ok: true, sprite: name, ir: res.ir };
    }

    if (method === 'POST' && path === '/propose') {
      const body = await readBody(req);
      const { ir } = JSON.parse(body);
      const proposalId = generateProposalId();
      const res = await sendToTW({ type: 'propose', ir, proposalId });
      if (!res.ok) {
        const err = new Error(res.error || 'Validation failed');
        err.code = 400;
        throw err;
      }
      proposals.set(proposalId, 'pending');
      return { ok: true, proposalId };
    }

    const proposalMatch = path.match(/^\/proposal\/(.+)$/);
    if (method === 'GET' && proposalMatch) {
      const proposalId = proposalMatch[1];
      const status = proposals.get(proposalId);
      if (status === undefined) return { ok: false, error: 'Unknown proposal' };
      return { ok: true, proposalId, status };
    }

    const commitMatch = path.match(/^\/commit\/(.+)$/);
    if (method === 'POST' && commitMatch) {
      const proposalId = commitMatch[1];
      await sendToTW({ type: 'commit', proposalId });
      proposals.set(proposalId, 'approved');
      return { ok: true };
    }

    const rejectMatch = path.match(/^\/reject\/(.+)$/);
    if (method === 'POST' && rejectMatch) {
      const proposalId = rejectMatch[1];
      await sendToTW({ type: 'reject', proposalId });
      proposals.set(proposalId, 'rejected');
      return { ok: true };
    }

    const err = new Error('Not found');
    err.code = 404;
    throw err;
  }

  function handleRequest(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    const parsedUrl = new URL(req.url, `http://localhost`);

    route(req, parsedUrl)
      .then(result => {
        res.statusCode = 200;
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.statusCode = err.code || 400;
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
  }

  const server = http.createServer(handleRequest);
  const wss = new WebSocketServer({ server });

  wss.on('connection', socket => {
    twSocket = socket;
    socket.on('message', data => handleWsMessage(data));
    socket.on('close', () => { if (twSocket === socket) twSocket = null; });
    socket.on('error', () => { if (twSocket === socket) twSocket = null; });
  });

  return {
    start: () => new Promise(resolve => server.listen(port, resolve)),
    stop: () => new Promise(resolve => server.close(resolve)),
    get port() { return server.address() && server.address().port; },
    _proposals: proposals,
    _isConnected: () => twSocket !== null && twSocket.readyState === WebSocket.OPEN
  };
}

module.exports = { createBridge };

if (require.main === module) {
  const bridge = createBridge({ port: 7331 });
  bridge.start().then(() => {
    console.log(`TB2 bridge running on http://localhost:${bridge.port}`);
    console.log('Waiting for TurboWarp to connect...');
  });
}
