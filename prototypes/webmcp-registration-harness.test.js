const test = require('node:test');
const assert = require('node:assert/strict');
const {createToolDefinitions, register} = require('./webmcp-registration-harness.js');

const handlers = {review: () => {}, readFallback: () => {}};

test('primary mode registers exactly the pending review tool', async () => {
  const registered = [];
  const names = await register('primary', definition => registered.push(definition), handlers);
  assert.deepEqual(names, ['review_workout_adaptation']);
  assert.deepEqual(registered.map(definition => definition.name), names);
});

test('fallback mode registers only the stored-decision reader', async () => {
  const definitions = createToolDefinitions('fallback', handlers);
  assert.deepEqual(definitions.map(definition => definition.name), ['read_workout_adaptation_decision']);
  assert.equal(definitions.some(definition => definition.name === 'review_workout_adaptation'), false);
});
