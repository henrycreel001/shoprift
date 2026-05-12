/**
 * src/prompt.js — Shared readline singleton for all interactive prompts.
 * Buffers incoming lines so piped stdin works correctly across multiple ask() calls.
 */

import readline from 'readline';

const _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const _buf = [];
const _waiters = [];

_rl.on('line', line => {
  if (_waiters.length > 0) {
    _waiters.shift()(line.trim());
  } else {
    _buf.push(line.trim());
  }
});

/**
 * Prompts for a single line of input. Works with both interactive TTY and piped stdin.
 * @param {string} question — displayed to the user
 * @returns {Promise<string>} trimmed answer
 */
export async function ask(question) {
  process.stdout.write(question);
  if (_buf.length > 0) return Promise.resolve(_buf.shift());
  return new Promise(resolve => _waiters.push(resolve));
}

/** Closes the shared readline interface. Call once at process exit. */
export function closePrompt() {
  _rl.close();
}
