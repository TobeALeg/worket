import { ensure, object, string, array } from './definition.js';
import type { ContinuationGeneratorInput } from '../handoff/continuation.js';

export { CONTINUATION_CONSENT } from './continuation-consent.js';
export const CONTINUATION_MAX_CHARS = 80000;
export type ContinuationRequest = { schemaVersion: 1; input: ContinuationGeneratorInput };

export function validateContinuationRequest(value: unknown): asserts value is ContinuationRequest {
  object(value);
  const request = value as ContinuationRequest;
  ensure(request.schemaVersion === 1, 'UNSUPPORTED_SCHEMA');
  object(request.input);
  ensure(JSON.stringify(request.input).length <= CONTINUATION_MAX_CHARS, 'INPUT_TOO_LARGE');
  const { events, state, materials, artifacts, basis } = request.input;
  object(basis);
  for (const key of ['sourceDigest', 'stateDigest', 'materialDigest'] as const) string(basis[key]);
  ensure(Number.isInteger(basis.throughSequence) && basis.throughSequence >= 0, 'INVALID_INPUT');
  array(events); array(materials); array(artifacts); object(state);
  ensure(events.length > 0 && new Set(events.map(event => event.id)).size === events.length, 'INVALID_INPUT');
  for (const event of events) {
    object(event); string(event.id); string(event.kind); string(event.timestamp); string(event.executorType);
    ensure(event.kind !== 'reasoning.summary' && typeof event.content === 'string', 'INVALID_INPUT');
    ensure(Number.isInteger(event.sequence) && event.sequence > 0, 'INVALID_INPUT');
    object(event.metadata);
  }
  for (const key of ['objective', 'successCriteria', 'constraints', 'facts', 'decisions', 'completedActions', 'pendingActions', 'artifacts'] as const) {
    array(state[key]);
    for (const item of state[key]) {
      object(item); string(item.id); string(item.text); string(item.origin); array(item.sourceMessageIds);
      item.sourceMessageIds.forEach(string);
    }
  }
  for (const material of materials) {
    object(material); string(material.id); string(material.version); string(material.availability);
  }
  for (const artifact of artifacts) {
    object(artifact);
    for (const key of ['id', 'filename', 'sha256', 'availability', 'role'] as const) string(artifact[key]);
  }
}
