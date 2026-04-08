'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

/**
 * Calls Claude with the given system prompt and returns the text response.
 * Matches the callClaude contract expected by runner.js.
 *
 * @param {string} systemPrompt
 * @returns {Promise<string>}
 */
async function callClaude(systemPrompt) {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [
      { role: 'user', content: systemPrompt }
    ]
  });

  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

module.exports = { callClaude };
