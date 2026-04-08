'use strict';

/**
 * Parses the structured output from the Claude agent.
 *
 * Valid responses:
 *   IR_ONLY\n{ir}   → { type: 'IR_ONLY', ir: string }
 *   NO_CHANGE        → { type: 'NO_CHANGE' }
 *   ERROR:<reason>   → { type: 'ERROR', reason: string }
 *
 * Anything else (commentary mixed in, unrecognised prefix, empty):
 *                    → { type: 'PARSE_FAILURE', raw: string }
 */
function parseAgentResponse(raw) {
  const trimmed = raw.trim();

  if (trimmed === 'NO_CHANGE') {
    return { type: 'NO_CHANGE' };
  }

  if (trimmed.startsWith('ERROR:')) {
    const reason = trimmed.slice('ERROR:'.length).trim();
    if (!reason) return { type: 'PARSE_FAILURE', raw };
    return { type: 'ERROR', reason };
  }

  if (trimmed.startsWith('IR_ONLY\n') || trimmed === 'IR_ONLY') {
    const ir = trimmed.slice('IR_ONLY\n'.length);
    if (!ir || !ir.trim()) return { type: 'PARSE_FAILURE', raw };
    return { type: 'IR_ONLY', ir };
  }

  return { type: 'PARSE_FAILURE', raw };
}

module.exports = { parseAgentResponse };
