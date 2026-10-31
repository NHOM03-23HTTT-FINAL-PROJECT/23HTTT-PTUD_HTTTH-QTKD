import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, type CurrentUser } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { FileUploadField, type UploadedFile } from '@/components/file-upload/FileUploadField';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import { ContractUnavailable, RecordNotice } from '../components/ContractDetailParts';
import { ContractFormFields } from '../components/ContractFormParts';
import { useContractDraftForm } from '../hooks/useContractDraftForm';
import { ContractActionError, CreateContractError, type Contract, type ContractDraft } from '../types/contract';
import { CONTRACT_STATUS_BADGE, EDITABLE_STATUSES } from '../utils/contractStatus';
import { countContractErrors, formatContractValueInput, validateContractDraft } from '../utils/contractValidation';
import type { ContractDetailState } from './ContractDetailPage';
import './Contracts.css';

const FORM_ID = 'edit-contract-form';

type Load = { kind: 'loading' } | { kind: 'ok'; contract: Contract } | { kind: 'forbidden' | 'not-found' | 'error' };

function toDraft(contract: Contract): ContractDraft {
  return {
    customerCode: contract.customerCode,
    sourceMode: contract.sourceMode,
    templateCode: contract.templateCode,
    title: contract.title,
    contractType: contract.contractType,
    effectiveFrom: contract.effectiveFrom,
    effectiveTo: contract.effectiveTo,
    value: formatContractValueInput(String(contract.value)),
    paymentTerm: contract.paymentTerm,
    services: contract.services,
    content: contract.content,
  };
}

/** SYS-CTR-03 · Chỉnh sửa hợp đồng – chỉ người phụ trách, hồ sơ Nháp hoặc Yêu cầu chỉnh sửa. */
export function ContractEditPage() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { endSession } = useSession();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);

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
        else if (error instanceof ContractActionError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')) setLoad({ kind: error.code === 'FORBIDDEN' ? 'forbidden' : 'not-found' });
        else setLoad({ kind: 'error' });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, retry, user?.id]);

  if (!user) return null;
  const breadcrumb = <nav className="breadcrumb" aria-label="Đường dẫn"><Link to={ROUTES.contracts}>Hợp đồng</Link><span className="breadcrumb__separator">/</span><Link to={ROUTES.contractDetail(code)}>{code}</Link><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">Chỉnh sửa</span></nav>;
  if (load.kind === 'loading') return <>{breadcrumb}<p className="contract-loading">Đang tải hồ sơ…</p></>;
  if (load.kind !== 'ok') return <>{breadcrumb}<ContractUnavailable kind={load.kind} code={code} onRetry={load.kind === 'error' ? () => setRetry((n) => n + 1) : undefined} /></>;

  const contract = load.contract;
  // E1 (03.9) / E2 (03.10): từ chối chuyển sang chế độ chỉnh sửa, dữ liệu giữ nguyên.
  if (contract.ownerId !== user.id || !user.permissions.has('contracts.create')) {
    return <>{breadcrumb}<EditBlocked title="Không đủ quyền chỉnh sửa" body={`Chỉ người phụ trách hồ sơ (${contract.ownerName}) được chỉnh sửa ${contract.code}. Dữ liệu hợp đồng không thay đổi.`} code={code} /></>;
  }
  if (!EDITABLE_STATUSES.includes(contract.status)) return <>{breadcrumb}<StatusBlocked contract={contract} /></>;
  return <EditForm key={`${contract.code}-${contract.version}`} user={user} contract={contract} breadcrumb={breadcrumb} onReload={() => setRetry((n) => n + 1)} />;
}

function EditBlocked({ title, body, code }: { title: string; body: string; code: string }) {
  return <div className="contract-card contract-not-found"><span className="contract-not-found__icon"><Icon name="lock" size={28} /></span><h1>{title}</h1><p>{body}</p><div className="contract-not-found__actions"><ButtonLink to={ROUTES.contractDetail(code)} variant="secondary">Về chi tiết hợp đồng</ButtonLink></div></div>;
}

function StatusBlocked({ contract }: { contract: Contract }) {
  const latest = CONTRACT_STATUS_BADGE[contract.status].label;
  const hint = contract.status === 'submitted'
    ? 'Hồ sơ đang Đã trình và chưa bắt đầu rà soát: có thể rút hồ sơ về Nháp theo US-CTR-17 trước khi sửa.'
    : 'Hồ sơ đang rà soát, đã duyệt, bị từ chối hoặc đã hủy không được chỉnh sửa trực tiếp.';
  return <EditBlocked title="Hồ sơ không còn ở trạng thái cho phép sửa" body={`Trạng thái mới nhất: ${latest}. Chỉ sửa được khi hồ sơ ở Nháp hoặc Yêu cầu chỉnh sửa. ${hint}`} code={contract.code} />;
}

type EditAlert =
  | { kind: 'invalid'; count: number }
  | { kind: 'conflict' }
  | { kind: 'save-failed' }
  | { kind: 'status'; status: Contract['status'] }
  | { kind: 'forbidden' }
  | { kind: 'network' };

function EditForm({ user, contract, breadcrumb, onReload }: { user: CurrentUser; contract: Contract; breadcrumb: JSX.Element; onReload: () => void }) {
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef(toDraft(contract));
  const form = useContractDraftForm(initial.current);
  const { values } = form;
  const [attachments, setAttachmentsState] = useState<UploadedFile[]>(contract.attachments);
  const [alert, setAlert] = useState<EditAlert | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inFlight = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial.current);
  useUnsavedChanges(dirty ? `Chỉnh sửa ${contract.code}` : null);
  const badge = CONTRACT_STATUS_BADGE[contract.status];

  async function save() {
    if (inFlight.current) return;
    form.setAttempted(true);
    form.setServerErrors({});
    setAlert(null);
    const nextErrors = validateContractDraft(values);
    if (Object.keys(nextErrors).length > 0) {
      setAlert({ kind: 'invalid', count: countContractErrors(nextErrors) });
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await contractsApi.update({ userId: user.id, signedInAt: user.signedInAt, code: contract.code, baseVersion: contract.version, draft: values });
      const state: ContractDetailState = { updated: true };
      navigate(ROUTES.contractDetail(contract.code), { replace: true, state });
    } catch (error) {
      if (!(error instanceof ContractActionError)) setAlert({ kind: 'network' });
      else {
        form.setServerErrors(error.fieldErrors ?? {});
        switch (error.code) {
          case 'SESSION_ENDED':
            endSession(error.sessionStatus ?? 'expired');
            break;
          case 'VALIDATION':
            setAlert({ kind: 'invalid', count: countContractErrors(error.fieldErrors ?? {}) });
            break;
          case 'CONFLICT':
            setAlert({ kind: 'conflict' });
            break;
          case 'SAVE_FAILED':
            setAlert({ kind: 'save-failed' });
            break;
          case 'STATUS':
            setAlert({ kind: 'status', status: error.status ?? contract.status });
            break;
          case 'NOT_OWNER':
          case 'FORBIDDEN':
            setAlert({ kind: 'forbidden' });
            break;
          default:
            setAlert({ kind: 'network' });
        }
      }
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function changeAttachments(files: UploadedFile[]) {
    setUploading(true);
    try {
      const next = await contractsApi.setAttachments({ userId: user.id, signedInAt: user.signedInAt, code: contract.code, attachments: files });
      setAttachmentsState(next.attachments);
    } catch (error) {
      if (error instanceof CreateContractError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'disabled');
      else setAlert({ kind: 'network' });
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  const cancel = () => (dirty ? setLeaveOpen(true) : navigate(ROUTES.contractDetail(contract.code)));

  return (
    <>
      {breadcrumb}
      <div className="page-header">
        <div className="page-header__title contract-detail-title">
          <div><h1>Chỉnh sửa hợp đồng</h1><StatusBadge label={badge.label} tone={badge.tone} /></div>
          <p>{contract.code} · {contract.customerName}. Mã hợp đồng và trạng thái chỉ đọc; trạng thái giữ nguyên sau khi lưu.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={saving} onClick={cancel}>Hủy</Button>
          <Button type="submit" form={FORM_ID} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>
        </div>
      </div>

      <RecordNotice contract={contract} />
      {alert && <EditAlertBanner alert={alert} saving={saving} onRetry={() => void save()} onReload={onReload} />}

      <div className="contract-layout">
        <form ref={formRef} id={FORM_ID} className="contract-card contract-form" noValidate onSubmit={handleSubmit} aria-busy={saving}>
          <ContractFormFields form={form} disabled={saving} />
        </form>
        <aside className="contract-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin quản lý</h2>
            <p className="side-card__subtitle">Trường chỉ đọc, không chỉnh sửa tại biểu mẫu.</p>
            <div className="side-card__item"><span className="side-card__label">Mã hợp đồng</span><span className="side-card__value contract-readonly"><Icon name="lock" size={14} />{contract.code}</span></div>
            <div className="side-card__item"><span className="side-card__label">Trạng thái</span><StatusBadge label={badge.label} tone={badge.tone} /></div>
            <div className="side-card__item"><span className="side-card__label">Người phụ trách</span><span className="side-card__value">{contract.ownerName}</span></div>
            <div className="side-card__item"><span className="side-card__label">Lưu gần nhất</span><span className="side-card__value">{formatDateTime(contract.updatedAt)} · phiên bản {contract.version}</span></div>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Tệp đính kèm ({attachments.length})</h2>
            <p className="side-card__subtitle">Thêm hoặc xóa tệp được ghi nhận ngay và liên kết với {contract.code}.</p>
            <FileUploadField label="Tệp hợp đồng" files={attachments} disabled={uploading || saving} buttonLabel={uploading ? 'Đang cập nhật…' : '+ Tải tệp lên'} onChange={(files) => void changeAttachments(files)} />
          </section>
        </aside>
      </div>

      {leaveOpen && <Dialog title="Hủy các thay đổi chưa lưu?" icon="alert" width={480} initialFocus="first" onClose={() => setLeaveOpen(false)} actions={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Tiếp tục chỉnh sửa</Button><Button variant="danger" onClick={() => navigate(ROUTES.contractDetail(contract.code))}>Bỏ thay đổi</Button></>}><p className="dialog__body">Các thay đổi trên biểu mẫu sẽ bị bỏ và hệ thống trở về chế độ xem chi tiết. Nội dung hợp đồng đã lưu không thay đổi.</p></Dialog>}
    </>
  );
}

function EditAlertBanner({ alert, saving, onRetry, onReload }: { alert: EditAlert; saving: boolean; onRetry: () => void; onReload: () => void }) {
  if (alert.kind === 'invalid') return <Alert tone="danger" title={`Thông tin chỉnh sửa không hợp lệ – còn ${alert.count} trường cần kiểm tra`}>Sửa các trường được đánh dấu. Dữ liệu đang nhập được giữ nhưng hồ sơ chưa được cập nhật.</Alert>;
  if (alert.kind === 'conflict') return <Alert tone="warning" title="Hồ sơ đã thay đổi đồng thời" action={<button type="button" className="alert__link" onClick={onReload}>Tải lại hồ sơ</button>}>Hồ sơ vừa được lưu ở phiên làm việc khác. Hệ thống không ghi đè dữ liệu mới hơn; tải lại rồi chỉnh sửa lại nếu vẫn đủ điều kiện.</Alert>;
  if (alert.kind === 'status') return <Alert tone="warning" title="Hồ sơ không còn ở trạng thái cho phép sửa">Trạng thái mới nhất: {CONTRACT_STATUS_BADGE[alert.status].label}. Hệ thống từ chối lưu trực tiếp.</Alert>;
  if (alert.kind === 'forbidden') return <Alert tone="danger" title="Không đủ quyền chỉnh sửa">Quyền hoặc phạm vi phụ trách đã thay đổi; dữ liệu hợp đồng không thay đổi.</Alert>;
  const action = <button type="button" className="alert__link" disabled={saving} onClick={onRetry}>{saving ? 'Đang lưu…' : 'Thử lại'}</button>;
  return <Alert tone="danger" title={alert.kind === 'save-failed' ? 'Lưu không thành công' : 'Chưa nhận được kết quả lưu'} action={action}>Cập nhật thất bại; dữ liệu đã lưu trước đó được giữ nguyên. Nội dung trên biểu mẫu vẫn còn để thử lại.</Alert>;
}
