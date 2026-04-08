'use strict';

const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('./prompt-builder');
const { parseAgentResponse } = require('./response-parser');

const IR_GRAMMAR_PATH = path.resolve(__dirname, '../../IR_GRAMMAR.md');

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function bridgeGet(bridgeUrl, endpoint) {
  const res = await fetch(`${bridgeUrl}${endpoint}`);
  return { status: res.status, body: await res.json() };
}

async function bridgePost(bridgeUrl, endpoint, body = {}) {
  const res = await fetch(`${bridgeUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Core run function
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string}   opts.userPrompt   - Natural language task description
 * @param {string}  [opts.spriteName]  - Target sprite name (uses editingTarget from /state if omitted)
 * @param {boolean} [opts.dryRun]      - If true, return IR without proposing
 * @param {string}   opts.bridgeUrl    - Bridge base URL, e.g. 'http://localhost:7331'
 * @param {Function} opts.callClaude   - async (systemPrompt: string) => string
 *
 * @returns {Promise<
 *   {type:'proposed', proposalId:string} |
 *   {type:'no_change'} |
 *   {type:'dry_run', ir:string} |
 *   {type:'error', reason:string} |
 *   {type:'parse_failure', raw:string} |
 *   {type:'validation_failed', error:string} |
 *   {type:'bridge_error', error:string}
 * >}
 */
async function run({ userPrompt, spriteName, dryRun = false, bridgeUrl, callClaude }) {
  // 1. Get full project state
  let stateRes;
  try {
    stateRes = await bridgeGet(bridgeUrl, '/state');
  } catch (e) {
    return { type: 'bridge_error', error: e.message };
  }

  if (stateRes.status === 503 || !stateRes.body.ok) {
    return { type: 'bridge_error', error: stateRes.body.error || 'TurboWarp not connected' };
  }

  const fullStateIR = stateRes.body.ir;
  const targetSprite = spriteName || stateRes.body.editingTarget || 'Sprite1';

  // 2. Get target sprite IR
  let spriteRes;
  try {
    spriteRes = await bridgeGet(bridgeUrl, `/sprite/${encodeURIComponent(targetSprite)}`);
  } catch (e) {
    return { type: 'bridge_error', error: e.message };
  }

  if (!spriteRes.body.ok) {
    return { type: 'bridge_error', error: spriteRes.body.error || `Sprite not found: ${targetSprite}` };
  }

  const targetIR = spriteRes.body.ir;

  // 3. Build system prompt
  const irGrammar = fs.readFileSync(IR_GRAMMAR_PATH, 'utf8');
  const systemPrompt = buildPrompt({ irGrammar, fullStateIR, spriteName: targetSprite, targetIR, userPrompt });

  // 4. Call Claude
  const rawResponse = await callClaude(systemPrompt);
  const parsed = parseAgentResponse(rawResponse);

  if (parsed.type === 'NO_CHANGE') return { type: 'no_change' };
  if (parsed.type === 'ERROR') return { type: 'error', reason: parsed.reason };
  if (parsed.type === 'PARSE_FAILURE') return { type: 'parse_failure', raw: parsed.raw };

  const ir = parsed.ir;

  if (dryRun) return { type: 'dry_run', ir };

  // 5. Propose (with one retry on validation failure)
  const proposeResult = await propose(bridgeUrl, ir);
  if (proposeResult.type === 'proposed') return proposeResult;

  // Validation failed — retry once with error fed back
  const retryError = proposeResult.error;
  const retryPrompt = systemPrompt +
    `\n\nYour previous IR was rejected by the validator with this error: ${retryError}\n` +
    `Return a corrected IR_ONLY response. Same rules apply.`;

  const retryRaw = await callClaude(retryPrompt);
  const retryParsed = parseAgentResponse(retryRaw);

  if (retryParsed.type !== 'IR_ONLY') {
    return { type: 'validation_failed', error: retryError };
  }

  const retryResult = await propose(bridgeUrl, retryParsed.ir);
  if (retryResult.type === 'proposed') return retryResult;
  return { type: 'validation_failed', error: retryResult.error };
}

async function propose(bridgeUrl, ir) {
  const res = await bridgePost(bridgeUrl, '/propose', { ir });
  if (res.body.ok) return { type: 'proposed', proposalId: res.body.proposalId };
  return { type: 'validation_failed', error: res.body.error };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  let spriteName;
  let dryRun = false;

  const filteredArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sprite' && args[i + 1]) {
      spriteName = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const userPrompt = filteredArgs.join(' ');
  if (!userPrompt) {
    console.error('Usage: node runner.js [--sprite NAME] [--dry-run] "your prompt"');
    process.exit(1);
  }

  const { callClaude } = require('./claude-client');
  const bridgeUrl = process.env.TB2_BRIDGE_URL || 'http://localhost:7331';

  run({ userPrompt, spriteName, dryRun, bridgeUrl, callClaude }).then(result => {
    switch (result.type) {
      case 'proposed':
        console.log(`Proposal submitted: ${result.proposalId}`);
        console.log('Waiting for approval in TurboWarp.');
        break;
      case 'no_change':
        console.log('No changes needed.');
        break;
      case 'dry_run':
        console.log(result.ir);
        break;
      case 'error':
        console.error(`Agent error: ${result.reason}`);
        process.exit(1);
        break;
      case 'parse_failure':
        console.error('Agent returned an unrecognised response format.');
        process.exit(1);
        break;
      case 'validation_failed':
        console.error(`Validation failed after retry: ${result.error}`);
        process.exit(1);
        break;
      case 'bridge_error':
        console.error(`Bridge error: ${result.error}`);
        process.exit(1);
        break;
    }
  });
}

module.exports = { run };
