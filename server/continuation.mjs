import { CONTINUATION_PROMPT } from '../dist/contracts/continuation-prompt.js';
import { validateContinuationRequest } from '../dist/contracts/continuation.js';

export async function extractContinuation(request, provider, signal, onUsage) {
  validateContinuationRequest(request);
  const { result, usage } = await provider.call([
    { role: 'system', content: CONTINUATION_PROMPT },
    { role: 'user', content: JSON.stringify(request.input) },
  ], signal);
  onUsage(usage);
  return result;
}
