import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAuditQuery, validateAuditFilters, auditFilterMessage } from '../src/features/audit-logs/utils/auditQuery.ts';
import { actionLabel, entityTypeLabel, formatAuditValue } from '../src/features/audit-logs/utils/auditLabels.ts';
import { EMPTY_AUDIT_FILTERS } from '../src/features/audit-logs/types/auditLog.ts';

const UUID = '6f1c2e3a-1b2c-4d5e-8f90-123456789abc';
const filters = (patch) => ({ ...EMPTY_AUDIT_FILTERS, ...patch });

test('blank date fields are not sent so the server applies its default window (A4, A1)', () => {
  assert.equal(buildAuditQuery(filters({})), 'page=1&pageSize=20');
});

test('local calendar days become UTC instants: start of the first day, end of the last day', () => {
  const query = new URLSearchParams(buildAuditQuery(filters({ fromDate: '2026-11-01', toDate: '2026-11-03' })));
  assert.equal(query.get('from'), new Date('2026-11-01T00:00:00').toISOString());
  assert.equal(query.get('to'), new Date('2026-11-03T23:59:59.999').toISOString());
});

test('entity filter and paging are passed through, trimmed where they are text', () => {
  const query = new URLSearchParams(buildAuditQuery(filters({ entityId: ` ${UUID} `, entityType: 'Contract', action: 'CONTRACT_SUBMITTED', page: 2, pageSize: 50 })));
  assert.equal(query.get('entityId'), UUID);
  assert.equal(query.get('entityType'), 'Contract');
  assert.equal(query.get('action'), 'CONTRACT_SUBMITTED');
  assert.equal([query.get('page'), query.get('pageSize')].join('/'), '2/50');
});

test('inverted range is rejected on the end date before any request (E2)', () => {
  assert.deepEqual(validateAuditFilters(filters({ fromDate: '2026-11-05', toDate: '2026-11-01' })), { field: 'toDate', reason: 'RANGE_INVERTED' });
});

test('a window over 366 days is rejected unless an entity is selected (A1 has no range limit)', () => {
  const wide = filters({ fromDate: '2025-01-01', toDate: '2026-11-01' });
  assert.deepEqual(validateAuditFilters(wide), { field: 'fromDate', reason: 'RANGE_TOO_LONG' });
  assert.equal(validateAuditFilters({ ...wide, entityId: UUID }), null);
});

test('malformed ids and dates are named by field', () => {
  assert.deepEqual(validateAuditFilters(filters({ entityId: 'HD-000001' })), { field: 'entityId', reason: 'INVALID_ID' });
  assert.deepEqual(validateAuditFilters(filters({ actorId: 'x' })), { field: 'actorId', reason: 'INVALID_ID' });
  assert.deepEqual(validateAuditFilters(filters({ fromDate: '2026-02-31' })), { field: 'fromDate', reason: 'INVALID_DATE' });
  assert.equal(validateAuditFilters(filters({ entityId: UUID, fromDate: '2026-11-01', toDate: '2026-11-02' })), null);
});

test('every server reason has a Vietnamese message for the filter it belongs to', () => {
  for (const reason of ['INVALID_DATE', 'RANGE_INVERTED', 'RANGE_TOO_LONG', 'INVALID_ID', 'TOO_LONG']) {
    assert.match(auditFilterMessage(reason), /\S/);
  }
  assert.equal(auditFilterMessage('RANGE_TOO_LONG'), 'Khoảng thời gian không được vượt quá 366 ngày.');
});

test('known action and entity codes read in Vietnamese; unknown codes are shown as they are', () => {
  assert.equal(actionLabel('CONTRACT_SUBMITTED'), 'Trình duyệt hợp đồng');
  assert.equal(actionLabel('LOGIN_FAILED'), 'Đăng nhập thất bại');
  assert.equal(actionLabel('SOMETHING_NEW'), 'SOMETHING_NEW');
  assert.equal(entityTypeLabel('ContractApprovalAssignment'), 'Phân công người duyệt');
  assert.equal(entityTypeLabel('Payment'), 'Payment');
});

test('before/after values: null is a dash, objects are pretty JSON', () => {
  assert.equal(formatAuditValue(null), '—');
  assert.equal(formatAuditValue('Draft'), 'Draft');
  assert.equal(formatAuditValue({ reason: 'wrong-password' }), '{\n  "reason": "wrong-password"\n}');
});
