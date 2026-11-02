import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ApiError } from '@/lib/http/client';
import { formatDateTime, formatMoney } from '@/utils/format';
import { approvalApi, approvalReviewPath, type ReviewDocument, type ReviewRequest } from '../api/approvalApi';
import type { ApprovalDecision } from '../types/contract';
import { CONTRACT_STATUS_BADGE, STEP_LABELS } from '../utils/contractStatus';
import './Contracts.css';
import { LegalCoordinationPanel } from './LegalCoordinationPanel';

export function approvalError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Chưa nhận được kết quả. Tải lại hồ sơ để kiểm tra trước khi gửi lại; nội dung nhận xét vẫn được giữ.';
  if (error.code === 'WORKFLOW_ENGINE_UNAVAILABLE') return 'Chưa kết nối được Workflow Engine. Không có quyết định hoặc thay đổi trạng thái nào được ghi nhận.';
  if (error.status === 403) return 'Bạn không có quyền hoặc không phải người được giao xử lý hồ sơ này.';
  if (error.status === 409) return 'Lượt duyệt, bước xử lý hoặc phiên bản đã thay đổi. Hãy tải lại hồ sơ trước khi quyết định.';
  if (error.status === 400) return 'Kiểm tra nội dung nhận xét và thông tin lượt duyệt trước khi gửi.';
  if (error.status === 404) return 'Không tìm thấy hồ sơ.';
  return 'Không thể xử lý yêu cầu. Hãy tải lại để kiểm tra kết quả.';
}

/** Real API review only. No mock contract detail, editing, submission or automatic state transition. */
export function ContractReviewPage() {
  const { id = '' } = useParams();
  const [query] = useSearchParams();
  const { user, can } = useAuth();
  const rawStep = query.get('step');
  const step = rawStep === 'sales' || rawStep === 'legal' || rawStep === 'board' ? rawStep : null;
  const permission = step === 'legal' ? 'approvals.review-legal' : 'approvals.approve';
  const allowed = Boolean(!IS_MOCK_AUTH && step && can(permission));
  const [document, setDocument] = useState<ReviewDocument | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [decision, setDecision] = useState<ApprovalDecision>('approve');
  const [comment, setComment] = useState('');
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const target = `${id}|${step}|${user?.id}`;
  const currentTarget = useRef(target); currentTarget.current = target;
  useEffect(() => { setComment(''); setDecision('approve'); setNotice(''); keys.current.clear(); }, [id, step, user?.id]);
  useEffect(() => {
    let active = true;
    setDocument(null); setError(''); setLoading(true);
    if (!step || !allowed) { setLoading(false); return; }
    approvalApi.read(id, step).then(d => { if (active) setDocument(d); })
      .catch(e => { if (active) setError(approvalError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, step, allowed, reload, user?.id]);
  if (!step || !allowed) return <Alert tone="danger" title="Không có quyền rà soát">Chọn đúng vai trò và hồ sơ được giao từ danh sách phê duyệt.</Alert>;
  const current = document?.steps.find(s => s.key === step && s.assigneeId === user?.id);
  const pending = document?.roundResult === 'in-progress';
  const previousComplete = document && current && document.steps.filter(s => s.order < current.order)
    .every(s => s.state === 'done' && s.decision === 'approve' && s.reviewedVersion === document.submittedVersion);
  const ready = pending && previousComplete && document?.version === document?.submittedVersion;
  const canHandoff = ready && current?.state === 'done' && current.decision === 'approve' && current.requiresHandoff
    && document?.steps.some(s => s.order > current.order && ['waiting', 'unassigned'].includes(s.state));
  async function act(action: 'accept' | 'decide' | 'retry' | 'handoff') {
    if (!document || !step || inFlight.current || (action !== 'retry' && !current)) return;
    if (action === 'decide' && !comment.trim()) { setError('Nhập ý kiến/kết luận hoặc lý do bắt buộc trước khi xác nhận.'); return; }
    const request: ReviewRequest = { roundId: document.roundId, stepId: current?.id ?? '', viewedVersion: document.version, step };
    const body = { ...request, decision, comment: comment.trim() };
    const signature = JSON.stringify([id, action, action === 'decide' ? body : request]);
    const requestTarget = target;
    let key = keys.current.get(signature);
    if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = action === 'accept' ? await approvalApi.accept(id, request, key)
        : action === 'handoff' ? await approvalApi.handoff(id, request, key)
        : action === 'retry' ? await approvalApi.retry(id, step, key) : await approvalApi.decide(id, body, key);
      if (currentTarget.current !== requestTarget) return;
      setDocument(result.document);
      setNotice(result.pendingTask ?? result.document.pendingTask ?? 'Kết quả đã được lưu. Trạng thái và bước tiếp theo được cập nhật theo workflow.');
      if (action === 'decide') setComment('');
      keys.current.delete(signature);
    } catch (e) { if (currentTarget.current === requestTarget) setError(approvalError(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <>
    <div className="page-header"><div><h1>Rà soát · {STEP_LABELS[step]}</h1><p>Hồ sơ {id}</p></div>
      <Button variant="secondary" disabled={busy || loading} onClick={() => { setNotice(''); setReload(n => n + 1); }}>Tải lại hồ sơ</Button></div>
    {loading && <p role="status">Đang tải hồ sơ…</p>}
    {error && <Alert tone="danger" title="Chưa hoàn tất yêu cầu">{error}</Alert>}
    {notice && <Alert tone={document?.pendingTask ? 'warning' : 'info'} title="Kết quả xử lý">{notice}</Alert>}
    {document && <>
      <section className="side-card"><h2>{document.title}</h2>
        <p>{document.customerName} · Người phụ trách: {document.ownerName}</p>
        <p>Loại hợp đồng: {document.contractType} · Hiệu lực: {document.startDate ?? '—'} → {document.endDate ?? '—'}</p>
        <p>{CONTRACT_STATUS_BADGE[document.status].label} · Giá trị: {formatMoney(document.value)}</p>
        <p>Lượt {document.roundNo} · Bản đang xem {document.version} · Bản đã trình {document.submittedVersion}</p>
        <h3>Nội dung hợp đồng</h3><p style={{ whiteSpace: 'pre-wrap' }}>{document.content}</p>
        <h3>Điều kiện thanh toán</h3><p>{document.paymentTerm}</p>
        <h3>Phạm vi dịch vụ / khu vực</h3>{document.services?.map((s, i) => <p key={i}>{s.name} · {s.area} · {s.unit}</p>)}
        <h3>Tài liệu đính kèm</h3>{document.attachments.map((a, i) => <p key={`${a.name}-${i}`}>
          {/^https:\/\//i.test(a.url) ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}</p>)}
      </section>
      <section className="side-card"><h2>Kết quả rà soát trong lượt</h2>{[...document.steps].sort((a, b) => a.order - b.order).map(s =>
        <div key={s.id}><strong>{STEP_LABELS[s.key]} · {s.assigneeName ?? 'Đang chờ phân công'}</strong>
          <p>{s.state}{s.decision ? ` · ${s.decision}` : ''}{s.decidedAt ? ` · ${formatDateTime(s.decidedAt)}` : ''}</p><p>{s.comment}</p></div>)}</section>
      {document.pendingTask && <Alert tone="warning" title="Có phần việc chờ xử lý lại" action={document.pendingTask.toLowerCase().includes('thông báo') ? <Button disabled={busy} onClick={() => void act('retry')}>Gửi lại thông báo</Button> : undefined}>{document.pendingTask} Kết quả duyệt đã lưu được giữ nguyên.</Alert>}
      {step === 'legal' && <LegalCoordinationPanel document={document} editable={Boolean(ready && current?.state === 'reviewing')} />}
      {ready && current?.state === 'pending-accept' && step === 'sales' && <Button disabled={busy} onClick={() => void act('accept')}>Tiếp nhận rà soát</Button>}
      {canHandoff &&
        <Button disabled={busy} onClick={() => void act('handoff')}>Trình hồ sơ lên Ban Giám đốc</Button>}
      {ready && current?.state === 'reviewing' && document.status === 'under-review' && <section className="side-card"><h2>Quyết định</h2>
        <label>Kết quả <select value={decision} disabled={busy} onChange={e => setDecision(e.target.value as ApprovalDecision)}>
          <option value="approve">{step === 'board' ? 'Phê duyệt' : 'Chấp thuận'}</option><option value="revision">Yêu cầu chỉnh sửa</option><option value="reject">Từ chối</option></select></label>
        <TextAreaField label={step === 'legal' && decision === 'approve' ? 'Kết luận rà soát pháp lý' : 'Ý kiến / nội dung và lý do'} required value={comment} disabled={busy} onChange={e => setComment(e.target.value)} />
        <Button disabled={busy} onClick={() => void act('decide')}>{busy ? 'Đang ghi nhận…' : 'Xác nhận quyết định'}</Button>
      </section>}
      {!canHandoff && (!ready || !current || !['reviewing', 'pending-accept'].includes(current.state)) && <p>Hồ sơ chưa đến bước của bạn hoặc lượt/bước này đã kết thúc. Không thể ghi nhận thêm quyết định.</p>}
      <Link to={approvalReviewPath(id, step)}>Liên kết hồ sơ rà soát</Link>
    </>}
  </>;
}
