import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import type { Customer } from '@/features/customers/types/customer';
import { contractsApi } from '../api/contractsApi';
import { ContractFormFields } from '../components/ContractFormParts';
import { newId, useContractDraftForm } from '../hooks/useContractDraftForm';
import { CreateContractError } from '../types/contract';
import { countContractErrors, EMPTY_CONTRACT_DRAFT, isContractDraftEmpty, validateContractDraft } from '../utils/contractValidation';
import type { ContractDetailState } from './ContractDetailPage';
import './Contracts.css';

const FORM_ID = 'create-contract-form';

type ContractAlert =
  | { kind: 'invalid'; count: number }
  | { kind: 'customer-inactive' }
  | { kind: 'area-inactive' }
  | { kind: 'save-failed' }
  | { kind: 'network' }
  | { kind: 'forbidden' };

/** SYS-CTR-01 · Tạo hồ sơ hợp đồng – chỉ lưu Nháp, chưa khởi tạo quy trình phê duyệt. */
export function ContractCreatePage() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef(newId());
  const form = useContractDraftForm(EMPTY_CONTRACT_DRAFT);
  const { values, options } = form;
  const [alert, setAlert] = useState<ContractAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inFlight = useRef(false);

  const selectedCustomer = options.customers.find((customer) => customer.code === values.customerCode);
  const dirty = !isContractDraftEmpty(values);
  useUnsavedChanges(dirty ? `Tạo hợp đồng – ${values.title.trim() || 'chưa nhập tên'}` : null);

  if (!user) return null;

  async function save() {
    if (inFlight.current || !user) return;
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
    setSubmitting(true);
    try {
      const result = await contractsApi.create({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: requestId.current,
        draft: values,
      });
      const state: ContractDetailState = { created: true, replayed: result.replayed };
      navigate(ROUTES.contractDetail(result.contract.code), { replace: true, state });
    } catch (error) {
      if (!(error instanceof CreateContractError)) setAlert({ kind: 'network' });
      else {
        form.setServerErrors(error.fieldErrors ?? {});
        switch (error.code) {
          case 'SESSION_ENDED':
            endSession(error.sessionStatus ?? 'disabled');
            break;
          case 'CUSTOMER_INACTIVE':
            setAlert({ kind: 'customer-inactive' });
            break;
          case 'AREA_INACTIVE':
            setAlert({ kind: 'area-inactive' });
            break;
          case 'SAVE_FAILED':
            setAlert({ kind: 'save-failed' });
            break;
          case 'FORBIDDEN':
            setAlert({ kind: 'forbidden' });
            break;
          case 'VALIDATION':
            setAlert({ kind: 'invalid', count: countContractErrors(error.fieldErrors ?? {}) });
            break;
          default:
            setAlert({ kind: 'network' });
        }
      }
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Hợp đồng</span><span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">Tạo hợp đồng</span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <h1>Tạo hợp đồng</h1>
          <p>Trường có dấu * là bắt buộc. Hồ sơ được lưu ở trạng thái Nháp và chưa gửi phê duyệt.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={() => (dirty ? setLeaveOpen(true) : navigate(ROUTES.contracts))}>Hủy</Button>
          <Button type="submit" form={FORM_ID} disabled={submitting}>{submitting ? 'Đang lưu…' : 'Lưu nháp'}</Button>
        </div>
      </div>

      {alert && <ContractAlertBanner alert={alert} retrying={submitting} onRetry={() => void save()} customer={selectedCustomer} />}

      <div className="contract-layout">
        <form ref={formRef} id={FORM_ID} className="contract-card contract-form" noValidate onSubmit={handleSubmit} aria-busy={submitting}>
          <ContractFormFields form={form} disabled={submitting} />
        </form>

        <aside className="contract-layout__side">
          <ManagementCard owner={user.fullName} />
          <section className="side-card contract-attachment-locked">
            <div className="contract-side-title"><h2 className="side-card__title">Tệp đính kèm</h2><Icon name="lock" size={16} /></div>
            <p className="side-card__subtitle">Bổ sung sau khi lưu nháp</p>
            <p>Chỉ đính kèm được khi hợp đồng đã lưu và có mã định danh.</p>
            <button type="button" className="file-upload__button" disabled>+ Tải tệp lên</button>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Quy tắc nhập liệu</h2>
            <ul className="side-card__notes">
              <li>Khách hàng phải đang Hoạt động.</li><li>Ngày kết thúc không trước ngày bắt đầu.</li>
              <li>Giá trị hợp đồng phải lớn hơn 0.</li><li>Hạng mục gắn mặt bằng phải chọn khu vực Hoạt động.</li>
              <li>Lưu nháp không gửi hồ sơ phê duyệt.</li>
            </ul>
          </section>
        </aside>
      </div>

      {leaveOpen && <Dialog title="Rời biểu mẫu tạo hợp đồng?" width={480} initialFocus="first" onClose={() => setLeaveOpen(false)} actions={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Tiếp tục nhập</Button><Button variant="danger" onClick={() => navigate(ROUTES.contracts)}>Rời biểu mẫu</Button></>}><p className="dialog__body">Nội dung đã nhập chưa được lưu và hệ thống sẽ không tạo hồ sơ hợp đồng.</p></Dialog>}
    </>
  );
}

function ManagementCard({ owner }: { owner: string }) {
  return <section className="side-card"><h2 className="side-card__title">Thông tin quản lý</h2><p className="side-card__subtitle">Hệ thống gán sau khi lưu nháp.</p><div className="side-card__item"><span className="side-card__label">Mã hợp đồng</span><span className="side-card__value">Hệ thống cấp khi lưu</span></div><div className="side-card__item"><span className="side-card__label">Trạng thái</span><StatusBadge label="Nháp" tone="neutral" /></div><div className="side-card__item"><span className="side-card__label">Người phụ trách</span><span className="side-card__value">{owner}</span></div><div className="side-card__item"><span className="side-card__label">Ngày tạo</span><span className="side-card__value">Ghi nhận khi lưu</span></div></section>;
}

function ContractAlertBanner({ alert, retrying, onRetry, customer }: { alert: ContractAlert; retrying: boolean; onRetry: () => void; customer?: Customer }) {
  if (alert.kind === 'invalid') return <Alert tone="danger" title={`Chưa thể lưu hợp đồng – còn ${alert.count} thông tin cần kiểm tra`}>Bổ sung hoặc sửa các trường được đánh dấu. Nội dung đã nhập được giữ nguyên.</Alert>;
  if (alert.kind === 'customer-inactive') return <Alert tone="danger" title="Khách hàng không thể dùng để lập hợp đồng">{customer ? `${customer.code} · ${customer.name}` : 'Khách hàng đã chọn'} không còn ở trạng thái Hoạt động. Chọn khách hàng khác để tiếp tục; hồ sơ chưa được lưu.</Alert>;
  if (alert.kind === 'area-inactive') return <Alert tone="danger" title="Khu vực thực hiện không còn hợp lệ">Chọn lại khu vực đang Hoạt động cho các hạng mục được đánh dấu. Nội dung khác được giữ nguyên.</Alert>;
  if (alert.kind === 'forbidden') return <Alert tone="danger" title="Không có quyền tạo hợp đồng">Quyền của tài khoản đã thay đổi nên hồ sơ chưa được lưu.</Alert>;
  const action = <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>{retrying ? 'Đang kiểm tra…' : 'Kiểm tra kết quả và thử lại'}</button>;
  return <Alert tone="danger" title={alert.kind === 'save-failed' ? 'Không thể tạo hợp đồng' : 'Chưa nhận được kết quả lưu hồ sơ'} action={action}>Hệ thống chưa ghi nhận hồ sơ. Nội dung đã nhập vẫn được giữ; khi thử lại, hệ thống kiểm tra yêu cầu cũ và không tạo hồ sơ trùng.</Alert>;
}
