'use strict';

/**
 * TB2 MCP Server — Phase 5B
 *
 * Exposes 5 tools and the IR grammar as a resource to Codex, Claude Code,
 * and any other MCP-capable coding agent.
 * Spawns and owns the bridge process (bridge/bridge.js).
 *
 * Tools:
 *   tb2_start_bridge  — spawn the bridge; no-op if already running
 *   tb2_status        — bridge running? TurboWarp connected? editing target?
 *   tb2_get_state     — full project IR
 *   tb2_get_sprite    — one sprite's IR by name
 *   tb2_propose       — submit IR to TurboWarp proposal panel
 *
 * Resource:
 *   ir-grammar        — full contents of IR_GRAMMAR.md
 *
 * Config examples:
 *   Claude Code: repo-root .claude/settings.json
 *   Codex:       repo-root .codex/config.toml
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BRIDGE_PATH = path.resolve(__dirname, '../bridge/bridge.js');
const BRIDGE_URL = process.env.TB2_BRIDGE_URL || 'http://localhost:7331';
const IR_GRAMMAR_PATH = path.resolve(__dirname, '../../IR_GRAMMAR.md');

// ---------------------------------------------------------------------------
// Bridge process management
// ---------------------------------------------------------------------------

let bridgeProcess = null;

function isBridgeAlive() {
  return bridgeProcess !== null && !bridgeProcess.killed && bridgeProcess.exitCode === null;
}

function spawnBridge() {
  if (isBridgeAlive()) return { started: false, reason: 'already running' };
  bridgeProcess = spawn(process.execPath, [BRIDGE_PATH], {
    stdio: 'ignore',
    detached: false
  });
  bridgeProcess.on('exit', () => { bridgeProcess = null; });
  return { started: true };
}

// Kill bridge when this process exits
process.on('exit', () => { if (isBridgeAlive()) bridgeProcess.kill(); });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// ---------------------------------------------------------------------------
// HTTP helpers (same pattern as runner.js)
// ---------------------------------------------------------------------------

async function bridgeGet(endpoint) {
  const res = await fetch(`${BRIDGE_URL}${endpoint}`);
  return { status: res.status, body: await res.json() };
}

async function bridgePost(endpoint, body = {}) {
  const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'tb2',
  version: '1.0.0'
});

// --- tb2_start_bridge ---

server.tool(
  'tb2_start_bridge',
  'Start the TB2 bridge server. The bridge relays messages between your coding agent and TurboWarp Desktop. Call this before any other TB2 tools.',
  {},
  async () => {
    const result = spawnBridge();
    if (!result.started) {
      return { content: [{ type: 'text', text: 'Bridge is already running at ' + BRIDGE_URL }] };
    }
    // Give the bridge a moment to bind the port
    await new Promise(r => setTimeout(r, 500));
    return { content: [{ type: 'text', text: 'Bridge started at ' + BRIDGE_URL + '. TurboWarp will connect automatically within a few seconds.' }] };
  }
);

// --- tb2_status ---

server.tool(
  'tb2_status',
  'Check whether the bridge is running and whether TurboWarp Desktop is connected. Use this to confirm the system is ready before proposing changes, or to diagnose connection problems.',
  {},
  async () => {
    if (!isBridgeAlive()) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ bridge: 'not running', turbowarp: 'not connected', editingTarget: null })
        }]
      };
    }
    try {
      const res = await bridgeGet('/status');
      const s = res.body;
      const status = {
        bridge: 'running',
        turbowarp: s.turbowarpConnected ? 'connected' : 'not connected',
        editingTarget: s.editingTarget || null
      };
      return { content: [{ type: 'text', text: JSON.stringify(status) }] };
    } catch {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ bridge: 'running', turbowarp: 'not connected', editingTarget: null })
        }]
      };
    }
  }
);

// --- tb2_get_state ---

server.tool(
  'tb2_get_state',
  'Get the full project IR from TurboWarp. Returns IR for all sprites plus the current editing target. Use this for context before proposing changes.',
  {},
  async () => {
    try {
      const res = await bridgeGet('/state');
      if (!res.body.ok) {
        return { content: [{ type: 'text', text: 'Error: ' + (res.body.error || 'TurboWarp not connected') }], isError: true };
      }
      return { content: [{ type: 'text', text: res.body.ir }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
    }
  }
);

// --- tb2_get_sprite ---

server.tool(
  'tb2_get_sprite',
  'Get the IR for a single sprite by name. Use this to focus on the sprite you are about to modify.',
  { name: z.string().describe('The sprite name, e.g. "Sprite1"') },
  async ({ name }) => {
    try {
      const res = await bridgeGet('/sprite/' + encodeURIComponent(name));
      if (!res.body.ok) {
        return { content: [{ type: 'text', text: 'Error: ' + (res.body.error || 'Sprite not found') }], isError: true };
      }
      return { content: [{ type: 'text', text: res.body.ir }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
    }
  }
);

// --- tb2_propose ---

server.tool(
  'tb2_propose',
  'Submit IR to TurboWarp as a proposal. The user will see an Approve/Reject panel with a visual block preview. On validation failure the error is returned so you can correct and retry.',
  { ir: z.string().describe('Complete IR for the modified sprite, following IR_GRAMMAR.md exactly') },
  async ({ ir }) => {
    try {
      const res = await bridgePost('/propose', { ir });
      if (res.body.ok) {
        return {
          content: [{
            type: 'text',
            text: 'Proposal submitted (id: ' + res.body.proposalId + '). The user will see the Approve/Reject panel in TurboWarp.'
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: 'Validation error: ' + res.body.error
        }],
        isError: true
      };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
    }
  }
);

// --- ir-grammar resource ---

server.resource(
  'ir-grammar',
  'ir-grammar://IR_GRAMMAR.md',
  { mimeType: 'text/plain', description: 'The canonical IR grammar spec. This is the source of truth for all IR you generate. Read this before proposing any IR.' },
  async () => {
    const text = fs.readFileSync(IR_GRAMMAR_PATH, 'utf8');
    return { contents: [{ uri: 'ir-grammar://IR_GRAMMAR.md', mimeType: 'text/plain', text }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write('TB2 MCP server error: ' + err.message + '\n');
  process.exit(1);
});
