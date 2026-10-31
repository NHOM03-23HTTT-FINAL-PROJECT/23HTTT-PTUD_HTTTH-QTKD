import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { FileUploadField, type UploadedFile } from '@/components/file-upload/FileUploadField';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import type { Customer } from '@/features/customers/types/customer';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import {
  CreateContractError,
  type Contract,
  type ContractDraft,
  type ContractFieldErrors,
  type ContractServiceItem,
} from '../types/contract';
import {
  countContractErrors,
  EMPTY_CONTRACT_DRAFT,
  formatContractValueInput,
  isContractDraftEmpty,
  validateContractDraft,
} from '../utils/contractValidation';
import './Contracts.css';

const FORM_ID = 'create-contract-form';

type ContractAlert =
  | { kind: 'invalid'; count: number }
  | { kind: 'customer-inactive' }
  | { kind: 'area-inactive' }
  | { kind: 'save-failed' }
  | { kind: 'network' }
  | { kind: 'forbidden' };

function newId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** SYS-CTR-01 · Tạo hồ sơ hợp đồng – chỉ lưu Nháp, chưa khởi tạo quy trình phê duyệt. */
export function ContractCreatePage() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef(newId());
  const [values, setValues] = useState<ContractDraft>(EMPTY_CONTRACT_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ContractFieldErrors>({});
  const [alert, setAlert] = useState<ContractAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inFlight = useRef(false);
  const options = useMemo(() => contractsApi.getFormOptions(), []);

  const clientErrors = attempted ? validateContractDraft(values) : {};
  const errors: ContractFieldErrors = {
    ...clientErrors,
    ...serverErrors,
    serviceAreas: { ...clientErrors.serviceAreas, ...serverErrors.serviceAreas },
  };
  const selectedCustomer = options.customers.find((customer) => customer.code === values.customerCode);
  const selectedTemplate = options.templates.find((template) => template.code === values.templateCode);
  const dirty = !isContractDraftEmpty(values);
  useUnsavedChanges(dirty ? `Tạo hợp đồng – ${values.title.trim() || 'chưa nhập tên'}` : null);

  if (!user) return null;

  function setField<K extends keyof ContractDraft>(field: K, value: ContractDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseTemplate(code: string) {
    const template = options.templates.find((item) => item.code === code);
    if (!template) {
      setField('templateCode', '');
      return;
    }
    setValues((current) => ({
      ...current,
      sourceMode: 'template',
      templateCode: template.code,
      title: template.title,
      contractType: template.contractType,
      paymentTerm: template.paymentTerm,
      content: template.content,
      services: template.services.map((service, index) => ({
        ...service,
        id: `${template.code}-${index}`,
        areaCode: '',
      })),
    }));
    setServerErrors({});
  }

  function changeSourceMode(sourceMode: ContractDraft['sourceMode']) {
    if (sourceMode === values.sourceMode) return;
    if (sourceMode === 'blank') {
      setValues((current) => ({
        ...current,
        sourceMode,
        templateCode: '',
        title: '',
        contractType: '',
        paymentTerm: '',
        services: [],
        content: '',
      }));
    } else setValues((current) => ({ ...current, sourceMode }));
    setServerErrors({});
  }

  function addService() {
    const unused = options.services.find((option) => !values.services.some((item) => item.serviceCode === option.serviceCode));
    const service = unused ?? options.services[0];
    if (!service) return;
    setField('services', [...values.services, { ...service, id: newId(), areaCode: '' }]);
  }

  function updateService(id: string, patch: Partial<ContractServiceItem>) {
    setField('services', values.services.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setServerErrors((current) => ({
      ...current,
      serviceAreas: Object.fromEntries(Object.entries(current.serviceAreas ?? {}).filter(([key]) => key !== id)),
    }));
  }

  function chooseService(id: string, code: string) {
    const service = options.services.find((item) => item.serviceCode === code);
    if (service) updateService(id, { ...service, areaCode: '' });
  }

  async function save() {
    if (inFlight.current || !user) return;
    setAttempted(true);
    setServerErrors({});
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
      navigate(ROUTES.contractDetail(result.contract.code), {
        replace: true,
        state: { created: true, replayed: result.replayed },
      });
    } catch (error) {
      if (!(error instanceof CreateContractError)) setAlert({ kind: 'network' });
      else {
        setServerErrors(error.fieldErrors ?? {});
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
          <ContractSection title="Khách hàng" description="Chỉ chọn khách hàng đang ở trạng thái Hoạt động.">
            <CustomerPicker
              customers={options.customers}
              value={values.customerCode}
              error={errors.customerCode}
              disabled={submitting}
              onChange={(code) => setField('customerCode', code)}
            />
            {selectedCustomer && <CustomerSnapshot customer={selectedCustomer} />}
          </ContractSection>

          <hr className="contract-divider" />
          <ContractSection title="Mẫu hợp đồng" description="Dùng mẫu đã ban hành hoặc tự lập nội dung dự thảo mới.">
            <div className="contract-source-cards" role="radiogroup" aria-label="Cách lập hợp đồng">
              <SourceCard checked={values.sourceMode === 'template'} title="Dùng mẫu hợp đồng" description="Tải sẵn nội dung và điều khoản phổ biến." onClick={() => changeSourceMode('template')} />
              <SourceCard checked={values.sourceMode === 'blank'} title="Lập dự thảo mới" description="Tự nhập toàn bộ nội dung hợp đồng." onClick={() => changeSourceMode('blank')} />
            </div>
            {values.sourceMode === 'template' && (
              <div className="contract-grid">
                <SelectField
                  label="Mẫu hợp đồng" required placeholder="Chọn mẫu hợp đồng"
                  options={options.templates.map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))}
                  value={values.templateCode} error={errors.templateCode} disabled={submitting} onChange={chooseTemplate}
                />
                <InputField label="Phiên bản mẫu" value={selectedTemplate?.version ?? ''} placeholder="Tự hiển thị theo mẫu" disabled hint="Phiên bản đang có hiệu lực của mẫu đã chọn." />
              </div>
            )}
          </ContractSection>

          <hr className="contract-divider" />
          <ContractSection title="Thông tin chung">
            <InputField className="contract-span-2" label="Tên hợp đồng" required value={values.title} error={errors.title} disabled={submitting} placeholder="Nhập tên hợp đồng" onChange={(event) => setField('title', event.target.value)} />
            <div className="contract-grid">
              <InputField label="Loại hợp đồng" required list="contract-types" value={values.contractType} error={errors.contractType} disabled={submitting} placeholder="Chọn hoặc nhập loại hợp đồng" onChange={(event) => setField('contractType', event.target.value)} />
              <datalist id="contract-types">{options.contractTypes.map((type) => <option key={type} value={type} />)}</datalist>
              <div className="contract-date-grid">
                <InputField label="Bắt đầu hiệu lực" type="date" required value={values.effectiveFrom} error={errors.effectiveFrom} disabled={submitting} onChange={(event) => setField('effectiveFrom', event.target.value)} />
                <InputField label="Kết thúc hiệu lực" type="date" required value={values.effectiveTo} error={errors.effectiveTo} disabled={submitting} onChange={(event) => setField('effectiveTo', event.target.value)} />
              </div>
              <InputField label="Giá trị hợp đồng" required inputMode="numeric" value={values.value} error={errors.value} disabled={submitting} placeholder="0" trailing={<span className="field__suffix">₫</span>} onChange={(event) => setField('value', formatContractValueInput(event.target.value))} />
              <InputField label="Điều khoản thanh toán" required value={values.paymentTerm} error={errors.paymentTerm} disabled={submitting} placeholder="VD: Chuyển khoản trong 30 ngày" onChange={(event) => setField('paymentTerm', event.target.value)} />
            </div>
          </ContractSection>

          <hr className="contract-divider" />
          <ContractSection title="Phạm vi dịch vụ & khu vực thực hiện" description="Hạng mục có gắn mặt bằng bắt buộc chọn khu vực đang Hoạt động.">
            <ServiceTable
              items={values.services} serviceOptions={options.services} areaOptions={options.areas}
              errors={errors.serviceAreas} disabled={submitting}
              onChoose={chooseService} onUpdate={updateService}
              onRemove={(id) => setField('services', values.services.filter((item) => item.id !== id))}
            />
            {errors.services && <p className="field__error">{errors.services}</p>}
            <Button variant="secondary" className="contract-add-service" disabled={submitting} onClick={addService}>+ Thêm hạng mục dịch vụ</Button>
          </ContractSection>

          <hr className="contract-divider" />
          <ContractSection title="Nội dung hợp đồng" description={values.sourceMode === 'template' ? 'Nội dung được nạp từ mẫu và có thể điều chỉnh trong bản nháp.' : 'Nhập nội dung dự thảo theo thỏa thuận với khách hàng.'}>
            <div className={errors.content ? 'contract-editor contract-editor--error' : 'contract-editor'}>
              <div className="contract-editor__toolbar" aria-hidden="true"><strong>B</strong><em>I</em><span>Danh sách</span><span>Căn lề</span></div>
              <div className="contract-editor__body">
                {values.sourceMode === 'template' && <nav className="contract-editor__clauses" aria-label="Điều khoản"><strong>Điều khoản</strong><span>1. Phạm vi dịch vụ</span><span>2. Giá trị & thanh toán</span><span>3. Hiệu lực</span></nav>}
                <textarea aria-label="Nội dung hợp đồng" aria-invalid={errors.content ? true : undefined} value={values.content} disabled={submitting} placeholder="Nhập nội dung hợp đồng…" onChange={(event) => setField('content', event.target.value)} />
              </div>
            </div>
            {errors.content && <p className="field__error">{errors.content}</p>}
          </ContractSection>
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

export type ContractDetailState = { created?: boolean; replayed?: boolean };

/** Chi tiết tối thiểu của hồ sơ vừa tạo, bao gồm trạng thái 01.9 và bổ sung tệp 01.10. */
export function ContractDraftDetailPage() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { endSession } = useSession();
  const location = useLocation();
  const state = location.state as ContractDetailState | null;
  const [contract, setContract] = useState<Contract | undefined>(() => contractsApi.getContract(code));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  if (!user) return null;
  if (!contract) return <ContractNotFound code={code} />;

  async function setAttachments(attachments: UploadedFile[]) {
    if (!user) return;
    setUploading(true); setUploadError(false);
    try {
      const next = await contractsApi.setAttachments({ userId: user.id, signedInAt: user.signedInAt, code, attachments });
      setContract(next);
    } catch (error) {
      if (error instanceof CreateContractError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'disabled');
      else setUploadError(true);
    } finally { setUploading(false); }
  }

  const customer = contractsApi.getFormOptions().customers.find((item) => item.code === contract.customerCode);
  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Hợp đồng</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current">{contract.code}</span></nav>
      <div className="page-header">
        <div className="page-header__title contract-detail-title"><div><h1>{contract.title}</h1><p>{contract.code} · {contract.customerName}</p></div><StatusBadge label="Nháp" tone="neutral" /></div>
        <div className="page-header__actions"><ButtonLink to={ROUTES.contracts} variant="secondary">Hợp đồng của tôi</ButtonLink></div>
      </div>
      {state?.created && <Alert tone="success" title="Tạo hợp đồng thành công">Đã tạo hồ sơ {contract.code} ở trạng thái Nháp và ghi nhận bạn là người phụ trách. Có thể bổ sung tệp đính kèm ngay; hồ sơ chưa gửi phê duyệt.{state.replayed ? ' Đây là kết quả của yêu cầu đã được xử lý trước đó.' : ''}</Alert>}
      {uploadError && <Alert tone="danger" title="Chưa thể cập nhật tệp đính kèm">Dữ liệu tệp trên màn hình chưa được ghi nhận. Hãy thử lại.</Alert>}
      <div className="contract-layout contract-detail-layout">
        <div className="contract-card">
          <ContractSection title="Khách hàng"><CustomerSnapshot customer={customer} fallback={`${contract.customerCode} · ${contract.customerName}`} /></ContractSection>
          <hr className="contract-divider" />
          <ContractSection title="Thông tin chung"><dl className="contract-summary"><Summary label="Loại hợp đồng" value={contract.contractType} /><Summary label="Hiệu lực" value={`${formatDate(contract.effectiveFrom)} – ${formatDate(contract.effectiveTo)}`} /><Summary label="Giá trị" value={formatMoney(contract.value)} /><Summary label="Điều khoản thanh toán" value={contract.paymentTerm} /></dl></ContractSection>
          <hr className="contract-divider" />
          <ContractSection title="Phạm vi dịch vụ"><div className="contract-detail-services">{contract.services.map((item) => <div key={item.id}><strong>{item.serviceName}</strong><span>{item.serviceCode} · {item.unit}{item.areaCode ? ` · ${item.areaCode}` : ''}</span></div>)}</div></ContractSection>
          <hr className="contract-divider" />
          <ContractSection title="Nội dung hợp đồng"><div className="contract-content-readonly">{contract.content}</div></ContractSection>
        </div>
        <aside className="contract-layout__side">
          <section className="side-card"><h2 className="side-card__title">Thông tin quản lý</h2><div className="side-card__item"><span className="side-card__label">Mã hợp đồng</span><strong>{contract.code}</strong></div><div className="side-card__item"><span className="side-card__label">Trạng thái</span><StatusBadge label="Nháp" /></div><div className="side-card__item"><span className="side-card__label">Người phụ trách</span><span>{contract.ownerName}</span></div><div className="side-card__item"><span className="side-card__label">Ngày tạo</span><span>{formatDateTime(contract.createdAt)}</span></div></section>
          <section className="side-card"><h2 className="side-card__title">Tệp đính kèm ({contract.attachments.length})</h2><p className="side-card__subtitle">Tệp được gắn với {contract.code}; trạng thái hợp đồng vẫn là Nháp.</p><FileUploadField label="Tệp hợp đồng" files={contract.attachments} disabled={uploading} buttonLabel={uploading ? 'Đang cập nhật…' : '+ Tải tệp lên'} onChange={(files) => void setAttachments(files)} /></section>
        </aside>
      </div>
    </>
  );
}

function ContractSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="contract-section"><div className="contract-section__heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function SourceCard({ checked, title, description, onClick }: { checked: boolean; title: string; description: string; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={checked} className={checked ? 'contract-source-card contract-source-card--selected' : 'contract-source-card'} onClick={onClick}><span className="contract-radio" /><span><strong>{title}</strong><small>{description}</small></span></button>;
}

function CustomerPicker({ customers, value, error, disabled, onChange }: { customers: Customer[]; value: string; error?: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer.code === value);
  const normalized = keyword.toLocaleLowerCase('vi');
  const filtered = customers.filter((customer) => `${customer.code} ${customer.name} ${customer.taxCode}`.toLocaleLowerCase('vi').includes(normalized)).slice(0, 8);
  return <div className="field contract-customer-picker"><label className="field__label" htmlFor="contract-customer">Khách hàng<span className="field__required">*</span></label><div className={error ? 'field__box field__box--error' : 'field__box'}><Icon name="search" className="field__icon" /><input id="contract-customer" className="field__input" value={open ? keyword : selected ? `${selected.code} · ${selected.name}` : keyword} disabled={disabled} aria-invalid={error ? true : undefined} placeholder="Tìm theo mã, tên hoặc mã số thuế" onFocus={() => { setKeyword(''); setOpen(true); }} onChange={(event) => { setKeyword(event.target.value); setOpen(true); }} /></div>{open && <div className="contract-customer-options">{filtered.length ? filtered.map((customer) => <button type="button" key={customer.code} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(customer.code); setOpen(false); setKeyword(''); }}><span><strong>{customer.name}</strong><small>{customer.code} · MST {customer.taxCode}</small></span><StatusBadge label="Hoạt động" tone="success" /></button>) : <p>Không tìm thấy khách hàng đang Hoạt động.</p>}</div>}{error && <p className="field__error">{error}</p>}</div>;
}

function CustomerSnapshot({ customer, fallback }: { customer?: Customer; fallback?: string }) {
  if (!customer) return fallback ? <div className="contract-customer-snapshot"><strong>{fallback}</strong></div> : null;
  return <div className="contract-customer-snapshot"><div><span>Tên khách hàng</span><strong>{customer.name}</strong></div><div><span>Mã số thuế</span><strong>{customer.taxCode}</strong></div><div className="contract-span-2"><span>Địa chỉ</span><strong>{customer.address}</strong></div><div><span>Người đại diện</span><strong>{customer.representative}</strong></div><div><span>Liên hệ</span><strong>{customer.contactName || customer.email || customer.phone || '—'}</strong></div></div>;
}

function ServiceTable({ items, serviceOptions, areaOptions, errors, disabled, onChoose, onUpdate, onRemove }: { items: ContractServiceItem[]; serviceOptions: Omit<ContractServiceItem, 'id' | 'areaCode'>[]; areaOptions: { code: string; name: string }[]; errors?: Record<string, string>; disabled?: boolean; onChoose: (id: string, code: string) => void; onUpdate: (id: string, patch: Partial<ContractServiceItem>) => void; onRemove: (id: string) => void }) {
  if (!items.length) return <div className="contract-empty-services"><Icon name="list" /><p>Chưa có hạng mục dịch vụ.</p></div>;
  return <div className="contract-service-wrap"><table className="contract-service-table"><thead><tr><th>STT</th><th>Hạng mục dịch vụ</th><th>Gắn mặt bằng</th><th>Khu vực thực hiện</th><th><span className="visually-hidden">Thao tác</span></th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><select value={item.serviceCode} disabled={disabled} onChange={(event) => onChoose(item.id, event.target.value)}>{serviceOptions.map((service) => <option key={service.serviceCode} value={service.serviceCode}>{service.serviceName}</option>)}</select><small>{item.serviceCode} · Đơn vị: {item.unit}</small></td><td><label className="contract-switch"><input type="checkbox" checked={item.requiresArea} disabled={disabled} onChange={(event) => onUpdate(item.id, { requiresArea: event.target.checked, areaCode: '' })} /><span>{item.requiresArea ? 'Có' : 'Không'}</span></label></td><td><select value={item.areaCode} disabled={disabled || !item.requiresArea} aria-invalid={errors?.[item.id] ? true : undefined} onChange={(event) => onUpdate(item.id, { areaCode: event.target.value })}><option value="">{item.requiresArea ? 'Chọn khu vực' : 'Không áp dụng'}</option>{areaOptions.map((area) => <option key={area.code} value={area.code}>{area.code} · {area.name}</option>)}</select>{errors?.[item.id] && <small className="field__error">{errors[item.id]}</small>}</td><td><button type="button" className="contract-icon-button" disabled={disabled} aria-label={`Xóa ${item.serviceName}`} onClick={() => onRemove(item.id)}><Icon name="x" size={16} /></button></td></tr>)}</tbody></table></div>;
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

function Summary({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function ContractNotFound({ code }: { code: string }) { return <div className="contract-card contract-not-found"><Icon name="file" size={28} /><h1>Chưa có dữ liệu chi tiết cho {code}</h1><p>Trang chi tiết đầy đủ thuộc TASK-063. SYS-CTR-01 chỉ hiển thị hồ sơ được tạo trong prototype này.</p><ButtonLink to={ROUTES.contracts} variant="secondary">Quay lại danh sách hợp đồng</ButtonLink></div>; }
