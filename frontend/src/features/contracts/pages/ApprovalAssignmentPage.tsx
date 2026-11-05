import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { SelectField } from '@/components/form/SelectField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError } from '@/lib/http/client';
import { formatDateTime, formatMoney } from '@/utils/format';
import { approvalApi, type AssignmentCandidate, type AssignmentItem, type ReviewDocument, type ReviewStep } from '../api/approvalApi';
import type { ApprovalStepKey } from '../types/contract';
import './Contracts.css';

/** Tên bước theo nghiệp vụ duyệt (khác nhãn vai trò của STEP_LABELS). */
const STEP_NAMES: Record<ApprovalStepKey, string> = { sales: 'Rà soát kinh doanh', legal: 'Rà soát pháp lý', board: 'Phê duyệt' };

type BadgeTone = 'success' | 'neutral' | 'info' | 'warning' | 'danger' | 'accent';
const STEP_STATES: Record<string, { label: string; tone: BadgeTone }> = {
  unassigned: { label: 'Chưa phân công', tone: 'warning' },
  waiting: { label: 'Chưa tới lượt', tone: 'neutral' },
  'pending-accept': { label: 'Chờ tiếp nhận', tone: 'info' },
  reviewing: { label: 'Đang rà soát', tone: 'accent' },
  done: { label: 'Đã xử lý', tone: 'success' },
  stopped: { label: 'Không thực hiện', tone: 'neutral' },
};

/** Khớp AssignmentRules.CanAssign ở BE: lượt còn chạy và bước chưa bắt đầu. */
function canAssign(document: ReviewDocument, step: ReviewStep) {
  return document.roundResult === 'in-progress' && step.decision === null && ['unassigned', 'waiting', 'pending-accept'].includes(step.state);
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Chưa nhận được kết quả. Tải lại danh sách để kiểm tra trước khi thử lại.';
  switch (error.code) {
    case 'FORBIDDEN': return 'Bạn không phải trưởng bộ phận phụ trách bước này hoặc không còn quyền phân công.';
    case 'ASSIGNMENT_IMMUTABLE': return 'Bước đã bắt đầu rà soát nên không đổi được người duyệt.';
    case 'INVALID_ASSIGNEE': return 'Người được chọn không còn hợp lệ (không hoạt động, sai vai trò, hoặc là người lập hồ sơ).';
    case 'STEP_DONE': case 'VERSION_MISMATCH': return 'Hồ sơ hoặc lượt duyệt vừa thay đổi. Tải lại danh sách rồi phân công lại.';
    case 'NOT_FOUND': return 'Không tìm thấy hồ sơ hoặc bước duyệt.';
    default: return 'Không thể phân công. Tải lại danh sách để kiểm tra kết quả.';
  }
}

type Target = { document: ReviewDocument; step: ReviewStep };

/**
 * SYS-CTR-10 · Phân công người duyệt cho từng hồ sơ.
 * Trưởng bộ phận phân công bước của bộ phận mình: TP Kinh doanh → Rà soát kinh doanh, trưởng Pháp chế → Rà soát pháp lý,
 * trưởng BGĐ → Phê duyệt. Đổi người được khi bước chưa bắt đầu.
 */
export function ApprovalAssignmentPage() {
  const [items, setItems] = useState<AssignmentItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [onlyPending, setOnlyPending] = useState(true);
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (IS_MOCK_AUTH) return;
    let active = true;
    setLoadError(null);
    approvalApi.assignments()
      .then((result) => active && setItems(result))
      .catch((error) => active && setLoadError(error instanceof ApiError && error.status === 403
        ? 'Tài khoản không có quyền phân công người duyệt.'
        : 'Không thể tải danh sách hồ sơ cần phân công.'));
    return () => { active = false; };
  }, [retry]);

  const rows = useMemo(() => (items ?? []).filter((item) => !onlyPending
    || item.document.steps.some((step) => item.managedSteps.includes(step.key) && step.state === 'unassigned')), [items, onlyPending]);

  function replaceDocument(document: ReviewDocument) {
    setItems((current) => current?.map((item) => (item.document.id === document.id ? { ...item, document } : item)) ?? null);
  }

  const columns: Column<AssignmentItem>[] = [
    {
      key: 'contract', header: 'Hồ sơ',
      render: ({ document }) => <span className="contract-list__stack"><strong>{document.title}</strong><small>{document.customerName} · lập bởi {document.ownerName} · {formatMoney(document.value)}</small></span>,
    },
    { key: 'submitted', header: 'Trình lúc', width: 150, render: ({ document }) => <span className="contract-list__stack"><span>{formatDateTime(document.submittedAt)}</span><small>Lượt {document.roundNo}</small></span> },
    {
      key: 'steps', header: 'Bước bạn phụ trách',
      render: ({ document, managedSteps }) => (
        <ul className="assignment-steps">
          {document.steps.filter((step) => managedSteps.includes(step.key)).map((step) => {
            const state = STEP_STATES[step.state] ?? { label: step.state, tone: 'neutral' as const };
            return (
              <li key={step.id}>
                <span className="contract-list__stack"><strong>{STEP_NAMES[step.key]}</strong><small>{step.assigneeName ?? 'Chưa có người duyệt'}</small></span>
                <StatusBadge label={state.label} tone={state.tone} />
                {canAssign(document, step) && (
                  <Button variant={step.assigneeId ? 'secondary' : 'primary'} onClick={() => { setNotice(null); setTarget({ document, step }); }}>
                    {step.assigneeId ? 'Đổi người' : 'Phân công'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ),
    },
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Phê duyệt</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">Phân công người duyệt</span></nav>
      <div className="page-header">
        <div className="page-header__title">
          <h1>Phân công người duyệt</h1>
          <p>Phân công người duyệt cho bước của bộ phận bạn phụ trách trên từng hồ sơ. Đổi người được khi bước chưa bắt đầu rà soát.</p>
        </div>
      </div>

      {IS_MOCK_AUTH && <Alert tone="info" title="Chỉ hoạt động khi kết nối hệ thống">Phân công người duyệt đọc và ghi dữ liệu thật. Chạy với VITE_AUTH_MODE=api để sử dụng; prototype mock tự giao người duyệt mặc định.</Alert>}
      {notice && <Alert tone="success" title="Đã phân công">{notice}</Alert>}

      {!IS_MOCK_AUTH && (
        <section className="contract-results">
          <div className="contract-results__header">
            <h2>{items ? `${rows.length} hồ sơ` : 'Đang tải…'}</h2>
            <label className="contract-switch"><input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} /><span>Chỉ hồ sơ còn bước chưa phân công</span></label>
          </div>
          {loadError && <div className="contract-results__message"><Alert tone="danger" title={loadError} action={<button type="button" className="alert__link" onClick={() => setRetry((n) => n + 1)}>Tải lại</button>}>Chỉ trưởng bộ phận phụ trách bước duyệt mới thấy hồ sơ tại đây.</Alert></div>}
          {items && !loadError && rows.length === 0 && (
            <div className="contract-results__message"><Alert tone="info" title="Không có hồ sơ cần phân công">{onlyPending ? 'Mọi bước của bộ phận bạn đã có người duyệt.' : 'Không có hồ sơ đang trong lượt duyệt thuộc bộ phận bạn phụ trách.'}</Alert></div>
          )}
          {items && !loadError && rows.length > 0 && <DataTable columns={columns} rows={rows} rowKey={(item) => item.document.id} />}
        </section>
      )}

      {target && (
        <AssignDialog
          target={target}
          onClose={() => setTarget(null)}
          onAssigned={(document, name) => {
            replaceDocument(document);
            setTarget(null);
            setNotice(`${name} được phân công ${STEP_NAMES[target.step.key]} cho hồ sơ ${document.title}.`);
          }}
        />
      )}
    </>
  );
}

function AssignDialog({ target, onClose, onAssigned }: { target: Target; onClose: () => void; onAssigned: (document: ReviewDocument, name: string) => void }) {
  const { document, step } = target;
  const [candidates, setCandidates] = useState<AssignmentCandidate[] | null>(null);
  const [assigneeId, setAssigneeId] = useState(step.assigneeId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    approvalApi.candidates(document.id, step.key)
      .then((result) => active && setCandidates(result))
      .catch((err) => active && setError(errorMessage(err)));
    return () => { active = false; };
  }, [document.id, step.key]);

  async function confirm() {
    if (!assigneeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await approvalApi.assign(document.id, { roundId: document.roundId, stepId: step.id, viewedVersion: document.version, assigneeId });
      onAssigned(updated, candidates?.find((person) => person.id === assigneeId)?.name ?? 'Người được chọn');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const unchanged = assigneeId === (step.assigneeId ?? '');
  return (
    <Dialog
      title={`${step.assigneeId ? 'Đổi người' : 'Phân công'} · ${STEP_NAMES[step.key]}`}
      icon="users" tone="info" width={520} initialFocus="first"
      onClose={busy ? () => undefined : onClose}
      actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy || !assigneeId || unchanged} onClick={() => void confirm()}>{busy ? 'Đang lưu…' : 'Xác nhận'}</Button></>}
    >
      <div className="dialog__body contract-dialog-summary">
        <dl>
          <div><dt>Hồ sơ</dt><dd>{document.title}</dd></div>
          <div><dt>Người lập</dt><dd>{document.ownerName}</dd></div>
          {step.assigneeName && <div><dt>Người duyệt hiện tại</dt><dd>{step.assigneeName}</dd></div>}
        </dl>
        {error && <Alert tone="danger" title="Không thể phân công">{error}</Alert>}
        {!candidates && !error && <p>Đang tải danh sách người duyệt…</p>}
        {candidates && candidates.length === 0 && <Alert tone="warning" title="Không có người phù hợp">Không có người còn hoạt động, đúng vai trò và có quyền duyệt cho bước này.</Alert>}
        {candidates && candidates.length > 0 && (
          <SelectField label="Người duyệt" required placeholder="Chọn người duyệt" value={assigneeId}
            options={candidates.map((person) => ({ value: person.id, label: `${person.name} · ${person.title}` }))}
            onChange={setAssigneeId} />
        )}
        <p>Người lập hồ sơ không được duyệt. Người được phân công nhận thông báo; người bị thay cũng được báo.</p>
      </div>
    </Dialog>
  );
}
