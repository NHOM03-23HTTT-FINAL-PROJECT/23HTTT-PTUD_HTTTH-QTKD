import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import { useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ROUTES } from '@/constants/routes';
import { ApiError } from '@/lib/http/client';
import { formatDateTime } from '@/utils/format';
import { approvalApi, type ReviewDocument, type ReviewRequest } from '../api/approvalApi';
import type { ApprovalDecision, Contract } from '../types/contract';
import { approvalError, approvalPermission, approvalStepFor, approvalView } from '../utils/approvalReview';
import { latestRound, STEP_LABELS } from '../utils/contractStatus';
import { LegalCoordinationPanel } from '../pages/LegalCoordinationPanel';

const DECISIONS: ApprovalDecision[] = ['approve', 'revision', 'reject'];
const label = (decision: ApprovalDecision, step: string) => decision === 'revision' ? 'Yêu cầu chỉnh sửa'
  : decision === 'reject' ? 'Từ chối' : step === 'board' ? 'Phê duyệt' : 'Chấp thuận';

/** One real workflow panel embedded in the canonical contract detail page (SYS-CTR-07/08/09). */
export function ContractApprovalPanel({ contract, user, onRefresh }: {
  contract: Contract; user: CurrentUser; onRefresh: () => Promise<void>;
}) {
  const step = approvalStepFor(user);
  const round = latestRound(contract);
  const assigned = Boolean(step && user.permissions.has(approvalPermission(step))
    && round?.steps.some(s => s.key === step && s.assigneeId === user.id));
  const [doc, setDoc] = useState<ReviewDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState<ApprovalDecision>('approve');
  const [commentError, setCommentError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const target = `${contract.id}|${round?.id ?? round?.no}|${user.id}`;
  const currentTarget = useRef(target); currentTarget.current = target;
  useUnsavedChanges(comment.trim() ? `Nhận xét rà soát ${contract.code}` : null);
  useEffect(() => { setComment(''); setDecision('approve'); setConfirm(false); setNotice(''); keys.current.clear(); }, [target]);
  useEffect(() => {
    const abort = new AbortController();
    setDoc(null); setError('');
    if (!contract.id || !step || !assigned || !round) { setLoading(false); return; }
    setLoading(true);
    approvalApi.read(contract.id, step, abort.signal).then(next => { if (!abort.signal.aborted) { setDoc(next); setBlocked(false); } })
      .catch(e => { if (!abort.signal.aborted) setError(approvalError(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [contract.id, contract.version, round?.id, round?.no, round?.result, assigned, step, user.id, reload]);
  const view = approvalView(contract, user, doc);
  if (!step) return null;
  const own = doc?.steps.find(s => s.key === step && s.assigneeId === user.id);
  const disabled = busy || loading;
  const actionDisabled = disabled || blocked;
  async function refresh() {
    if (inFlight.current) return;
    setLoading(true); setError('');
    try { await onRefresh(); setReload(n => n + 1); }
    catch (e) { setError(approvalError(e)); }
    finally { setLoading(false); }
  }
  async function act(action: 'accept' | 'decide' | 'handoff' | 'retry') {
    if (!doc || !own || !step || inFlight.current || blocked || view.kind === 'stale') return;
    if (action === 'decide' && !comment.trim()) { setConfirm(false); setCommentError('Nhập ý kiến/kết luận hoặc lý do bắt buộc.'); return; }
    const expected: ReviewRequest = { roundId: doc.roundId, stepId: own.id, viewedVersion: contract.version, step };
    const body = { ...expected, decision, comment: comment.trim() };
    const signature = JSON.stringify([doc.id, action, action === 'decide' ? body : expected]);
    let key = keys.current.get(signature);
    if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
    const requestedTarget = target;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = action === 'accept' ? await approvalApi.accept(doc.id, expected, key)
        : action === 'handoff' ? await approvalApi.handoff(doc.id, expected, key)
        : action === 'retry' ? await approvalApi.retry(doc.id, step, key) : await approvalApi.decide(doc.id, body, key);
      if (!mounted.current || currentTarget.current !== requestedTarget) return;
      setDoc(result.document); setConfirm(false);
      if (action === 'decide') setComment('');
      keys.current.delete(signature);
      const saved = action === 'accept' ? 'Đã tiếp nhận rà soát. Hồ sơ chuyển sang Đang rà soát.'
        : action === 'handoff' ? 'Đã ghi nhận việc trình Ban Giám đốc. Kết luận Pháp chế được giữ nguyên.'
        : action === 'retry' ? 'Đã xử lý lại thông báo. Kết quả duyệt đã lưu được giữ nguyên.'
        : decision === 'revision' ? 'Đã yêu cầu chỉnh sửa. Lượt duyệt dừng lại; hồ sơ phải được trình lại từ Trưởng phòng Kinh doanh.'
        : decision === 'reject' ? 'Đã từ chối hồ sơ và kết thúc lượt duyệt.'
        : step === 'legal' ? 'Đã lưu kết luận Pháp chế. Tiếp tục trình hồ sơ lên Ban Giám đốc.'
        : step === 'board' ? 'Phê duyệt thành công. Hợp đồng chuyển sang Đã duyệt; phiên bản được duyệt bị khóa chỉnh sửa.'
        : 'Đã chấp thuận tại Trưởng phòng Kinh doanh. Hồ sơ tiếp tục ở bước Pháp chế; nếu chưa có người nhận thì cần phân công.';
      setNotice(saved);
      try { await onRefresh(); } catch { setNotice(`${saved} Chưa tải lại được phần chi tiết; hãy tải lại hồ sơ để kiểm tra trạng thái mới nhất.`); }
    } catch (e) {
      if (!mounted.current || currentTarget.current !== requestedTarget) return;
      setConfirm(false); setError(approvalError(e));
      if (e instanceof ApiError && [403, 409].includes(e.status)) setBlocked(true);
      if (e instanceof ApiError && e.status === 409) setDoc(null);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="review-panel" aria-label={`Rà soát ${STEP_LABELS[step]}`} aria-busy={disabled}>
    <div className="review-panel__head"><div><h2>{step === 'board' ? 'Phê duyệt' : 'Rà soát'} · {STEP_LABELS[step]}</h2>
      <p>{round ? `Lượt ${round.no} · Phiên bản đang xem ${contract.version} · Bản đã trình ${round.contractVersion}` : 'Chưa có lượt duyệt'}</p></div>
      <Button variant="secondary" disabled={disabled} onClick={() => void refresh()}>Tải lại hồ sơ</Button></div>
    {error && <Alert tone="danger" title="Chưa hoàn tất thao tác">{error}</Alert>}
    {notice && <Alert tone="success" title="Kết quả xử lý">{notice}</Alert>}
    {loading ? <p role="status">Đang kiểm tra lượt duyệt và phân công…</p> : <p className="review-panel__text">{view.message}</p>}
    {assigned && !contract.id && <Alert tone="warning" title="Chưa tải đủ thông tin xử lý">Hồ sơ chưa có định danh phục vụ phê duyệt. Hãy tải lại sau khi cập nhật API.</Alert>}
    {!assigned && round?.result === 'in-progress' && user.permissions.has('approvals.assign') &&
      <Link className="contract-link" to={ROUTES.approvalAssignments}>Mở Phân công người duyệt</Link>}
    {doc && doc.pendingTask && <Alert tone="warning" title="Có phần việc chờ xử lý">{doc.pendingTask}</Alert>}
    {doc && doc.pendingTask?.toLowerCase().includes('thông báo') &&
      <div className="review-panel__actions"><Button variant="secondary" disabled={actionDisabled} onClick={() => void act('retry')}>Gửi lại thông báo</Button></div>}
    {doc && view.kind === 'accept' && <div className="review-panel__actions"><Button disabled={actionDisabled} onClick={() => void act('accept')}>Tiếp nhận rà soát</Button></div>}
    {doc && view.kind === 'handoff' && <div className="review-panel__actions"><Button disabled={actionDisabled} onClick={() => void act('handoff')}>Trình hồ sơ lên Ban Giám đốc</Button></div>}
    {doc && view.kind === 'decide' && <>
      {doc.steps.some(s => s.order < (own?.order ?? 0)) && <div className="review-panel__previous">{doc.steps.filter(s => s.order < (own?.order ?? 0)).map(s =>
        <div key={s.id}><strong>{STEP_LABELS[s.key]} · {s.assigneeName}</strong><span>{s.comment ?? 'Đã chấp thuận'}{s.decidedAt ? ` · ${formatDateTime(s.decidedAt)}` : ''}</span></div>)}</div>}
      <div className="review-panel__decisions" role="radiogroup" aria-label="Quyết định rà soát">{DECISIONS.map(d =>
        <button key={d} type="button" role="radio" aria-checked={decision === d} disabled={disabled}
          className={`review-option review-option--${d}${decision === d ? ' review-option--selected' : ''}`}
          onClick={() => { setDecision(d); setCommentError(''); }}><span className="contract-radio" />{label(d, step)}</button>)}</div>
      <TextAreaField label={decision === 'approve' ? step === 'legal' ? 'Kết luận rà soát pháp lý' : step === 'board' ? 'Ý kiến phê duyệt' : 'Ý kiến rà soát'
        : decision === 'revision' ? 'Nội dung cần chỉnh sửa và lý do' : 'Lý do từ chối'} required maxLength={4000} value={comment} error={commentError} disabled={disabled}
        onChange={e => { setComment(e.target.value); setCommentError(''); }} />
      <div className="review-panel__actions"><Button variant={decision === 'reject' ? 'danger' : 'primary'} disabled={actionDisabled} onClick={() => {
        if (!comment.trim()) { setCommentError('Nhập ý kiến/kết luận hoặc lý do bắt buộc.'); return; } setConfirm(true);
      }}>{label(decision, step)}</Button></div>
    </>}
    {doc && step === 'legal' && <LegalCoordinationPanel key={doc.roundId} document={doc} editable={view.kind === 'decide' && !actionDisabled} />}
    {confirm && <Dialog title={`${label(decision, step)} hợp đồng?`} tone={decision === 'reject' ? 'danger' : 'info'} icon={decision === 'reject' ? 'alert' : 'info'} width={520}
      initialFocus="first" onClose={() => { if (!busy) setConfirm(false); }} actions={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Quay lại</Button>
        <Button variant={decision === 'reject' ? 'danger' : 'primary'} disabled={busy} onClick={() => void act('decide')}>{busy ? 'Đang ghi nhận…' : 'Xác nhận quyết định'}</Button></>}>
      <div className="dialog__body"><p>{contract.code} · Lượt {round?.no} · Phiên bản {contract.version}</p><p className="approval-confirm-comment">{comment.trim()}</p>
        <p>{decision === 'approve' ? step === 'board' ? 'Quyết định hợp lệ tại bước cuối sẽ chuyển hợp đồng sang Đã duyệt.' : 'Kết quả được lưu trên đúng lượt và phiên bản đang rà soát.'
          : decision === 'revision' ? 'Lượt hiện tại dừng lại. Hồ sơ sau chỉnh sửa phải được trình lại từ Trưởng phòng Kinh doanh.' : 'Lượt duyệt kết thúc và hồ sơ không chuyển sang bước tiếp theo.'}</p></div>
    </Dialog>}
  </section>;
}
