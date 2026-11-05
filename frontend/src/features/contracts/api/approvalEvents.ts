export const APPROVALS_CHANGED = 'qtkd:approvals-changed';

export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event(APPROVALS_CHANGED));
}
