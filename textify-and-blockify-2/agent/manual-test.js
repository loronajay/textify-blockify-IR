'use strict';

/**
 * Manual round-trip test for Phase 5.
 * Uses a hardcoded callClaude so no API key is needed.
 *
 * Setup:
 *   1. node bridge/bridge.js
 *   2. Load blockify-turbowarp-2.embedded.js + textify-turbowarp-2.js in TurboWarp Desktop
 *   3. In TurboWarp console: globalThis.__tb2Blockify.connectBridge({ URL: 'ws://localhost:7331' })
 *   4. node agent/manual-test.js
 */

const { run } = require('./runner');

// Hardcoded IR: green flag hat → move 10 steps
// Hat blocks chain body blocks as stack siblings (via <next>), not SUBSTACK.
const FIXTURE_IR = `[script
  body:[stack:
    [opcode:event_whenflagclicked
      id:"hat1"
      fields:{}
      inputs:{}
      stacks:{}
    ]
    [opcode:motion_movesteps
      id:"move1"
      fields:{}
      inputs:{STEPS:[literal:number:10]}
      stacks:{}
    ]
  ]
]`;

async function main() {
  const bridgeUrl = process.env.TB2_BRIDGE_URL || 'http://localhost:7331';

  console.log(`Bridge: ${bridgeUrl}`);
  console.log('Prompt: add a move 10 steps block on green flag');
  console.log('(callClaude is hardcoded — no API key needed)\n');

  const callClaude = async (systemPrompt) => {
    console.log('--- system prompt (first 300 chars) ---');
    console.log(systemPrompt.slice(0, 300) + '...');
    console.log('--- Claude response (fixture) ---');
    console.log('IR_ONLY');
    console.log(FIXTURE_IR.slice(0, 80) + '...\n');
    return `IR_ONLY\n${FIXTURE_IR}`;
  };

  const result = await run({
    userPrompt: 'add a move 10 steps block on green flag',
    bridgeUrl,
    callClaude
  });

  console.log('Runner result:', result);

  if (result.type === 'proposed') {
    console.log('\nProposal panel should be visible in TurboWarp.');
    console.log('Click Approve — the block should appear in the workspace.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
