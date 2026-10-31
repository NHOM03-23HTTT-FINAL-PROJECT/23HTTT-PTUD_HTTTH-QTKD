import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { FileUploadField, type UploadedFile } from '@/components/file-upload/FileUploadField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { contractsApi } from '../api/contractsApi';
import {
  AttachmentList,
  ContractInfoSections,
  ContractUnavailable,
  ManagementInfoCard,
  ProgressSummaryCard,
  RecordNotice,
} from '../components/ContractDetailParts';
import { ReviewPanel, type PageNotice } from '../components/ReviewPanel';
import { newId } from '../hooks/useContractDraftForm';
import { ContractActionError, CreateContractError, type Contract, type SubmitCheck } from '../types/contract';
import { CONTRACT_STATUS_BADGE, EDITABLE_STATUSES, STEP_LABELS } from '../utils/contractStatus';
import './Contracts.css';

export type ContractDetailState = { created?: boolean; replayed?: boolean; updated?: boolean };
export type ContractListState = { cancelled?: string };

type Load = { kind: 'loading' } | { kind: 'ok'; contract: Contract } | { kind: 'forbidden' | 'not-found' | 'error' };

/** SYS-CTR-06 · Xem chi tiết hợp đồng – kèm thao tác theo quyền và trạng thái (03, 04, 05, 07, 08, 09). */
export function ContractDetailPage() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { endSession } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const arrival = location.state as ContractDetailState | null;
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [submitCheck, setSubmitCheck] = useState<SubmitCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryingTask, setRetryingTask] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: 'loading' });
    contractsApi
      .getDetail({ userId: user.id, signedInAt: user.signedInAt, code, retry: retry > 0 })
      .then((contract) => active && setLoad({ kind: 'ok', contract }))
      .catch((error) => {
        if (!active) return;
        if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else if (error instanceof ContractActionError && error.code === 'FORBIDDEN') setLoad({ kind: 'forbidden' });
        else if (error instanceof ContractActionError && error.code === 'NOT_FOUND') setLoad({ kind: 'not-found' });
        else setLoad({ kind: 'error' });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, retry, user?.id]);

  if (!user) return null;
  const breadcrumb = <nav className="breadcrumb" aria-label="Đường dẫn"><Link to={ROUTES.contracts}>Hợp đồng</Link><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">{code}</span></nav>;
  if (load.kind === 'loading') return <>{breadcrumb}<p className="contract-loading">Đang tải hồ sơ…</p></>;
  if (load.kind !== 'ok') return <>{breadcrumb}<ContractUnavailable kind={load.kind} code={code} onRetry={load.kind === 'error' ? () => setRetry((n) => n + 1) : undefined} /></>;

  const contract = load.contract;
  const actor = { userId: user.id, signedInAt: user.signedInAt };
  const isOwner = contract.ownerId === user.id;
  const editable = isOwner && user.permissions.has('contracts.create') && EDITABLE_STATUSES.includes(contract.status);
  const badge = CONTRACT_STATUS_BADGE[contract.status];

  function apply(next: Contract | null, nextNotice: PageNotice | null) {
    if (next) setLoad({ kind: 'ok', contract: next });
    setNotice(nextNotice);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function actionError(error: unknown, action: 'submit' | 'cancel'): PageNotice | null {
    if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') {
      endSession(error.sessionStatus ?? 'expired');
      return null;
    }
    if (!(error instanceof ContractActionError)) return { tone: 'danger', title: 'Chưa nhận được kết quả', body: 'Mất kết nối. Hồ sơ giữ nguyên trạng thái; hãy thử lại.' };
    const latest = CONTRACT_STATUS_BADGE[error.status ?? contract.status].label;
    const verb = action === 'submit' ? 'trình duyệt' : 'hủy';
    switch (error.code) {
      case 'NOT_OWNER':
      case 'FORBIDDEN':
        return { tone: 'danger', title: 'Không đủ quyền', body: `Chỉ người phụ trách hồ sơ mới được ${verb}. Hồ sơ giữ nguyên trạng thái.` };
      case 'STATUS':
        return { tone: 'warning', title: action === 'submit' ? 'Hồ sơ không ở trạng thái được trình' : 'Hồ sơ không còn ở trạng thái Nháp', body: `Trạng thái mới nhất: ${latest}. Hệ thống từ chối ${verb}${action === 'submit' && error.status === 'submitted' ? ' và không tạo thêm lượt duyệt cho cùng lần trình' : ''}.` };
      case 'MISSING':
        return { tone: 'danger', title: 'Hồ sơ thiếu thông tin bắt buộc', body: `Bổ sung rồi trình lại: ${error.items?.join('; ')}.` };
      case 'AREA_INACTIVE':
        return { tone: 'danger', title: 'Có hạng mục dùng khu vực đã Tạm ngưng', body: `Đổi khu vực thực hiện cho: ${error.items?.join('; ')}. Hồ sơ chưa được trình.` };
      case 'NO_APPROVER':
        return { tone: 'warning', title: 'Chưa xác định được người duyệt', body: 'Quy trình phê duyệt chưa được cấu hình hoặc chưa có Trưởng phòng Kinh doanh được giao cho phạm vi hồ sơ. Liên hệ Quản trị hệ thống; hồ sơ giữ nguyên trạng thái.' };
      case 'SAVE_FAILED':
        return { tone: 'danger', title: action === 'submit' ? 'Gửi trình duyệt thất bại' : 'Hủy không thành công', body: 'Hệ thống chưa ghi nhận thao tác; không tạo lượt duyệt dở dang hoặc trùng. Thử lại khi sự cố được khắc phục.' };
      default:
        return { tone: 'danger', title: 'Không thể thực hiện thao tác', body: 'Đã xảy ra lỗi. Hãy thử lại.' };
    }
  }

  async function openSubmit() {
    setChecking(true);
    setNotice(null);
    try {
      setSubmitCheck(await contractsApi.checkSubmit({ ...actor, code }));
    } catch (error) {
      apply(null, actionError(error, 'submit'));
    } finally {
      setChecking(false);
    }
  }

  async function setAttachments(attachments: UploadedFile[]) {
    setUploading(true);
    try {
      const next = await contractsApi.setAttachments({ ...actor, code, attachments });
      setLoad({ kind: 'ok', contract: { ...contract, ...next } });
    } catch (error) {
      if (error instanceof CreateContractError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'disabled');
      else setNotice({ tone: 'danger', title: 'Chưa thể cập nhật tệp đính kèm', body: 'Dữ liệu tệp trên màn hình chưa được ghi nhận. Hãy thử lại.' });
    } finally {
      setUploading(false);
    }
  }

  async function retryPendingTask() {
    setRetryingTask(true);
    try {
      apply(await contractsApi.retryPendingTask({ ...actor, code }), { tone: 'success', title: 'Đã xử lý lại phần việc còn chờ', body: 'Kết quả phê duyệt giữ nguyên; không tạo trùng lượt duyệt.' });
    } catch {
      setNotice({ tone: 'danger', title: 'Chưa xử lý lại được', body: 'Hãy thử lại sau.' });
    } finally {
      setRetryingTask(false);
    }
  }

  return (
    <>
      {breadcrumb}
      <div className="page-header">
        <div className="page-header__title contract-detail-title">
          <div><h1>{contract.title}</h1><p>{contract.code} · {contract.customerName} · {contract.contractType}</p></div>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </div>
        <div className="page-header__actions">
          {editable && <ButtonLink to={ROUTES.contractEdit(code)} variant="secondary">Chỉnh sửa</ButtonLink>}
          {editable && contract.status === 'draft' && <Button variant="secondary" onClick={() => { setNotice(null); setCancelOpen(true); }}>Hủy hồ sơ</Button>}
          {editable && <Button disabled={checking} onClick={() => void openSubmit()}>{checking ? 'Đang kiểm tra…' : contract.status === 'revision-requested' ? 'Trình lại' : 'Gửi trình duyệt'}</Button>}
          {!editable && <ButtonLink to={ROUTES.contracts} variant="secondary">Danh sách hợp đồng</ButtonLink>}
        </div>
      </div>

      {arrival?.created && !notice && <Alert tone="success" title="Tạo hợp đồng thành công">Đã tạo hồ sơ {contract.code} ở trạng thái Nháp và ghi nhận bạn là người phụ trách. Có thể bổ sung tệp đính kèm ngay; hồ sơ chưa gửi phê duyệt.{arrival.replayed ? ' Đây là kết quả của yêu cầu đã được xử lý trước đó.' : ''}</Alert>}
      {arrival?.updated && !notice && <Alert tone="success" title="Cập nhật hợp đồng thành công">Thông tin vừa thay đổi đã được lưu và ghi nhật ký; trạng thái hồ sơ giữ nguyên ({badge.label}).</Alert>}
      {notice && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}
      {contract.pendingTask && (
        <Alert tone="warning" title="Có phần việc chờ xử lý lại" action={<button type="button" className="alert__link" disabled={retryingTask} onClick={() => void retryPendingTask()}>{retryingTask ? 'Đang xử lý…' : 'Xử lý lại'}</button>}>{contract.pendingTask} Kết quả đã lưu được giữ nguyên.</Alert>
      )}
      {!editable && isOwner && contract.status === 'submitted' && <Alert tone="info" title="Hồ sơ đã trình – không chỉnh sửa trực tiếp">Hồ sơ đang chờ Trưởng phòng Kinh doanh tiếp nhận. Nội dung bị khóa trong suốt quy trình phê duyệt.</Alert>}

      <RecordNotice contract={contract} />
      <ReviewPanel user={user} contract={contract} onChange={apply} />

      <div className="contract-layout contract-detail-layout">
        <ContractInfoSections contract={contract} />
        <aside className="contract-layout__side">
          <ManagementInfoCard contract={contract} />
          {editable ? (
            <section className="side-card"><h2 className="side-card__title">Tệp đính kèm ({contract.attachments.length})</h2><p className="side-card__subtitle">Tệp được gắn với {contract.code}; trạng thái hồ sơ không đổi khi đính kèm.</p><FileUploadField label="Tệp hợp đồng" files={contract.attachments} disabled={uploading} buttonLabel={uploading ? 'Đang cập nhật…' : '+ Tải tệp lên'} onChange={(files) => void setAttachments(files)} /></section>
          ) : <AttachmentList contract={contract} />}
          <ProgressSummaryCard contract={contract} />
        </aside>
      </div>

      {submitCheck && <SubmitDialog contract={contract} check={submitCheck} actor={actor} onClose={() => setSubmitCheck(null)} onDone={(next, replayed) => { setSubmitCheck(null); apply(next, { tone: 'success', title: 'Gửi trình duyệt thành công', body: `${next.code} chuyển sang Đã trình và được giao cho ${submitCheck.salesReviewer} (${STEP_LABELS.sales}). Hồ sơ bị khóa chỉnh sửa trực tiếp.${submitCheck.resubmit ? ' Lượt mới bắt đầu lại từ bước Trưởng phòng; kết quả các lượt trước được giữ trong lịch sử.' : ''}${replayed ? ' Đây là kết quả của yêu cầu đã gửi trước đó.' : ''}` }); }} onError={(error) => { setSubmitCheck(null); apply(null, actionError(error, 'submit')); }} />}
      {cancelOpen && <CancelDialog contract={contract} actor={actor} onClose={() => setCancelOpen(false)} onDone={() => { const state: ContractListState = { cancelled: code }; navigate(ROUTES.contracts, { state }); }} onError={(error) => { setCancelOpen(false); apply(null, actionError(error, 'cancel')); }} />}
    </>
  );
}

type Actor = { userId: string; signedInAt: string };

/** 04.1 / 04.8: xác nhận mã hồ sơ, khách hàng, tuyến duyệt; một Idempotency-Key cho mỗi lần mở hộp thoại. */
function SubmitDialog({ contract, check, actor, onClose, onDone, onError }: { contract: Contract; check: SubmitCheck; actor: Actor; onClose: () => void; onDone: (contract: Contract, replayed: boolean) => void; onError: (error: unknown) => void }) {
  const requestId = useRef(newId());
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await contractsApi.submit({ ...actor, code: contract.code, idempotencyKey: requestId.current });
      onDone(result.contract, result.replayed);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={check.resubmit ? 'Trình lại hồ sơ sau chỉnh sửa?' : 'Gửi trình duyệt hợp đồng?'} icon="workflow" tone="info" width={560} initialFocus="first" onClose={busy ? () => undefined : onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button disabled={busy} onClick={() => void confirm()}>{busy ? 'Đang gửi…' : 'Xác nhận trình'}</Button></>}>
      <div className="dialog__body contract-dialog-summary">
        <dl>
          <div><dt>Mã hợp đồng</dt><dd>{contract.code}</dd></div>
          <div><dt>Khách hàng</dt><dd>{contract.customerName}</dd></div>
          <div><dt>Tuyến duyệt</dt><dd>Trưởng phòng Kinh doanh → Pháp chế → Ban Giám đốc</dd></div>
          <div><dt>Bước đầu giao cho</dt><dd>{check.salesReviewer}</dd></div>
          <div><dt>Cấu hình áp dụng</dt><dd>{check.configLabel}</dd></div>
        </dl>
        <p>{check.resubmit ? 'Hệ thống tạo lượt duyệt mới bắt đầu lại từ Trưởng phòng Kinh doanh; kết quả các lượt trước được giữ trong lịch sử.' : 'Sau khi trình, hồ sơ chuyển sang Đã trình và không được chỉnh sửa trực tiếp.'}</p>
      </div>
    </Dialog>
  );
}

/** 05.1 / 05.2: xác nhận hủy, lý do bắt buộc; lỗi lưu (05.3) giữ hộp thoại để thử lại. */
function CancelDialog({ contract, actor, onClose, onDone, onError }: { contract: Contract; actor: Actor; onClose: () => void; onDone: () => void; onError: (error: unknown) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!reason.trim()) {
      setError('Nhập lý do hủy hồ sơ.');
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await contractsApi.cancel({ ...actor, code: contract.code, reason });
      onDone();
    } catch (err) {
      if (err instanceof ContractActionError && err.code === 'SAVE_FAILED') setFailed(true);
      else if (err instanceof ContractActionError && err.code === 'VALIDATION') setError('Nhập lý do hủy hồ sơ.');
      else onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Hủy hồ sơ dự thảo?" icon="alert" tone="danger" width={540} initialFocus="first" onClose={busy ? () => undefined : onClose} actions={<><Button variant="secondary" disabled={busy} onClick={onClose}>Không</Button><Button variant="danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Đang hủy…' : 'Xác nhận hủy'}</Button></>}>
      <div className="dialog__body contract-dialog-form">
        <dl className="contract-dialog-summary"><div><dt>Mã hồ sơ</dt><dd>{contract.code}</dd></div><div><dt>Tên hợp đồng</dt><dd>{contract.title}</dd></div></dl>
        <Alert tone="warning" title="Hồ sơ bị hủy sẽ không thể tiếp tục chỉnh sửa hoặc trình duyệt">Hồ sơ chuyển sang Đã hủy; lý do, người hủy và thời điểm hủy được lưu lại.</Alert>
        {failed && <Alert tone="danger" title="Hủy không thành công">Hệ thống chưa cập nhật trạng thái; hồ sơ vẫn ở Nháp. Hãy thử lại.</Alert>}
        <TextAreaField label="Lý do hủy" required value={reason} error={error} hint="Lý do được lưu cùng người hủy và thời điểm hủy." disabled={busy} onChange={(event) => { setReason(event.target.value); setError(''); }} />
      </div>
    </Dialog>
  );
}
