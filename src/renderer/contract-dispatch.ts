import type { WorkDetailView } from '../ui-contract.js';

type DispatchWork = Pick<WorkDetailView, 'status' | 'dispatchStatus' | 'dispatchReadAt' | 'captureStatus' | 'bindings'>;
/** A launch/read receipt alone must not claim that a conversation has taken over. */
export function contractDispatchState(work: DispatchWork): 'created' | 'failed' | 'waiting' | 'received' {
  if (work.dispatchReadAt && work.captureStatus === 'recording') return 'received';
  if (work.bindings.some(binding => binding.status === 'ACTIVE')) return 'waiting';
  if (work.dispatchStatus === 'FAILED') return 'failed';
  if (!work.dispatchStatus || work.dispatchStatus === 'NOT_DISPATCHED') return 'created';
  return 'waiting';
}
