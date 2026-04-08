'use strict';

const { WebSocket } = require('ws');
const { createBridge } = require('./bridge');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetch(url, options = {}) {
  return globalThis.fetch(url, options);
}

async function json(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
}

function postJson(url, body) {
  return json(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Connects a mock WebSocket client to the bridge.
// Returns { ws, messages } where messages accumulates every parsed message received.
// The client auto-responds to any message with type X by calling replyFn(msg) if provided.
function connectMockClient(port, replyFn = null) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('error', reject);
    ws.on('open', () => {
      ws.on('message', data => {
        const msg = JSON.parse(data);
        messages.push(msg);
        if (replyFn) {
          const reply = replyFn(msg);
          if (reply) ws.send(JSON.stringify(reply));
        }
      });
      resolve({ ws, messages });
    });
  });
}

function closeClient(ws) {
  return new Promise(resolve => {
    ws.once('close', resolve);
    ws.close();
  });
}

const SIMPLE_IR = `[script
  body:[stack:
    [opcode:motion_movesteps
      id:"s1"
      fields:{}
      inputs:{STEPS:[literal:number:10]}
      stacks:{}
    ]
  ]
]`;

// ---------------------------------------------------------------------------
// Setup — fresh bridge per describe block
// ---------------------------------------------------------------------------

describe('GET /status', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('reports disconnected when no TurboWarp client is connected', async () => {
    const res = await json(`${url}/status`);
    expect(res.ok).toBe(true);
    expect(res.bridge).toBe('running');
    expect(res.turbowarp).toBe('disconnected');
  });

  test('reports connected after TurboWarp client connects', async () => {
    const { ws } = await connectMockClient(bridge.port);
    const res = await json(`${url}/status`);
    expect(res.turbowarp).toBe('connected');
    await closeClient(ws);
  });

  test('reports disconnected again after client disconnects', async () => {
    const { ws } = await connectMockClient(bridge.port);
    await closeClient(ws);
    await new Promise(r => setTimeout(r, 20)); // let close event propagate
    const res = await json(`${url}/status`);
    expect(res.turbowarp).toBe('disconnected');
  });
});

describe('GET /state', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0, timeout: 500 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('returns 503 when TurboWarp is not connected', async () => {
    const res = await fetch(`${url}/state`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('forwards getState to TurboWarp and returns IR', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'getState') {
        return { id: msg.id, type: 'stateResponse', ok: true, ir: SIMPLE_IR };
      }
    });
    const res = await json(`${url}/state`);
    expect(res.ok).toBe(true);
    expect(res.ir).toBe(SIMPLE_IR);
    await closeClient(ws);
  });

  test('returns 504 when TurboWarp does not respond in time', async () => {
    const { ws } = await connectMockClient(bridge.port); // connects but never replies
    const res = await fetch(`${url}/state`);
    expect(res.status).toBe(504);
    await closeClient(ws);
  });

  test('returns error when TurboWarp responds with ok:false (e.g. Textify 2 not loaded)', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'getState') {
        return { id: msg.id, ok: false, error: 'Textify 2 not loaded' };
      }
    });
    const res = await fetch(`${url}/state`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Textify 2 not loaded');
    await closeClient(ws);
  });
});

describe('GET /sprite/:name', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0, timeout: 500 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('returns 503 when TurboWarp is not connected', async () => {
    const res = await fetch(`${url}/sprite/Sprite1`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('forwards getSprite to TurboWarp and returns IR', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'getSprite') {
        return { id: msg.id, ok: true, ir: SIMPLE_IR };
      }
    });
    const res = await json(`${url}/sprite/Sprite1`);
    expect(res.ok).toBe(true);
    expect(res.sprite).toBe('Sprite1');
    expect(res.ir).toBe(SIMPLE_IR);
    await closeClient(ws);
  });

  test('returns 404 with error when TurboWarp reports sprite not found', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'getSprite') {
        return { id: msg.id, ok: false, error: `Sprite not found: ${msg.name}` };
      }
    });
    const res = await fetch(`${url}/sprite/DoesNotExist`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('DoesNotExist');
    await closeClient(ws);
  });
});

describe('POST /propose', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0, timeout: 500 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('forwards propose message to TurboWarp and returns proposalId', async () => {
    const { ws, messages } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') {
        return { id: msg.id, type: 'proposeResponse', ok: true, proposalId: msg.proposalId };
      }
    });
    const res = await postJson(`${url}/propose`, { ir: SIMPLE_IR });
    expect(res.ok).toBe(true);
    expect(typeof res.proposalId).toBe('string');
    expect(messages.some(m => m.type === 'propose')).toBe(true);
    await closeClient(ws);
  });

  test('returns error when TurboWarp reports validation failure', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') {
        return { id: msg.id, type: 'proposeResponse', ok: false, error: 'ParseError: bad IR' };
      }
    });
    const httpRes = await fetch(`${url}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: 'bad IR' })
    });
    expect(httpRes.status).toBe(400);
    const body = await httpRes.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('ParseError');
    await closeClient(ws);
  });
});

describe('GET /proposal/:id', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0, timeout: 500 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('returns pending after a successful propose', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') {
        return { id: msg.id, type: 'proposeResponse', ok: true, proposalId: msg.proposalId };
      }
    });
    const propose = await postJson(`${url}/propose`, { ir: SIMPLE_IR });
    const status = await json(`${url}/proposal/${propose.proposalId}`);
    expect(status.ok).toBe(true);
    expect(status.status).toBe('pending');
    await closeClient(ws);
  });

  test('updates to approved when TurboWarp sends proposalApproved', async () => {
    const { ws } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') {
        return { id: msg.id, type: 'proposeResponse', ok: true, proposalId: msg.proposalId };
      }
    });
    const propose = await postJson(`${url}/propose`, { ir: SIMPLE_IR });
    // Simulate user clicking Approve in TurboWarp
    ws.send(JSON.stringify({ type: 'proposalApproved', proposalId: propose.proposalId }));
    await new Promise(r => setTimeout(r, 20));
    const status = await json(`${url}/proposal/${propose.proposalId}`);
    expect(status.status).toBe('approved');
    await closeClient(ws);
  });

  test('returns error for unknown proposal id', async () => {
    const res = await json(`${url}/proposal/nonexistent`);
    expect(res.ok).toBe(false);
  });
});

describe('POST /commit/:id and POST /reject/:id', () => {
  let bridge, url;
  beforeAll(async () => {
    bridge = createBridge({ port: 0, timeout: 500 });
    await bridge.start();
    url = `http://localhost:${bridge.port}`;
  });
  afterAll(() => bridge.stop());

  test('commit forwards commit message to TurboWarp', async () => {
    const { ws, messages } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') return { id: msg.id, type: 'proposeResponse', ok: true, proposalId: msg.proposalId };
      if (msg.type === 'commit') return { id: msg.id, type: 'commitResponse', ok: true };
    });
    const { proposalId } = await postJson(`${url}/propose`, { ir: SIMPLE_IR });
    await postJson(`${url}/commit/${proposalId}`, {});
    expect(messages.some(m => m.type === 'commit' && m.proposalId === proposalId)).toBe(true);
    await closeClient(ws);
  });

  test('reject forwards reject message to TurboWarp', async () => {
    const { ws, messages } = await connectMockClient(bridge.port, msg => {
      if (msg.type === 'propose') return { id: msg.id, type: 'proposeResponse', ok: true, proposalId: msg.proposalId };
      if (msg.type === 'reject') return { id: msg.id, type: 'rejectResponse', ok: true };
    });
    const { proposalId } = await postJson(`${url}/propose`, { ir: SIMPLE_IR });
    await postJson(`${url}/reject/${proposalId}`, {});
    expect(messages.some(m => m.type === 'reject' && m.proposalId === proposalId)).toBe(true);
    await closeClient(ws);
  });
});
