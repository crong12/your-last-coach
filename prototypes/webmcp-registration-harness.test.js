const test = require('node:test');
const assert = require('node:assert/strict');
const {register} = require('./webmcp-registration-harness.js');

const handlers = {review: () => {}, readFallback: () => {}};

async function registeredNamesFor(mode) {
  const registered = [];
  const names = await register(mode, definition => registered.push(definition), handlers);
  assert.deepEqual(registered.map(definition => definition.name), names);
  return names;
}

test('primary mode registers exactly the pending review tool', async () => {
  assert.deepEqual(await registeredNamesFor('primary'), ['review_workout_adaptation']);
});

test('fallback mode registers only the stored-decision reader', async () => {
  assert.deepEqual(await registeredNamesFor('fallback'), ['read_workout_adaptation_decision']);
});
