(function (root) {
  function createToolDefinitions(mode, handlers) {
    if (mode === 'fallback') {
      return [{
        name: 'read_workout_adaptation_decision',
        description: 'Read and clear a locally stored decision from the two-call fallback.',
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
        execute: handlers.readFallback
      }];
    }

    return [{
      name: 'review_workout_adaptation',
      description: 'Open one Athlete review and wait for explicit approval or discussion.',
      inputSchema: {type: 'object', properties: {}, additionalProperties: false},
      execute: handlers.review
    }];
  }

  async function register(mode, registrar, handlers) {
    const definitions = createToolDefinitions(mode, handlers);
    for (const definition of definitions) await registrar(definition);
    return definitions.map(definition => definition.name);
  }

  root.WebMCPRegistrationHarness = {createToolDefinitions, register};
  if (typeof module !== 'undefined') module.exports = root.WebMCPRegistrationHarness;
})(globalThis);
