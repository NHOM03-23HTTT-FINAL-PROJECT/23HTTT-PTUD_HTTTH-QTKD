import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { InputField } from '@/components/form/InputField';
import { MultiSelectField, SelectField } from '@/components/form/SelectField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { customersApi } from '../api/customersApi';
import { FormSection } from '../components/FormSection';
import { useCreateCustomerForm, type CreateCustomerAlert } from '../hooks/useCreateCustomerForm';
import type { CustomerDraft } from '../types/customer';
import type { CustomerDetailState } from './CustomerDetailPage';
import './CustomerPages.css';

const FORM_ID = 'create-customer-form';

type TextField = Exclude<keyof CustomerDraft, 'customerGroup' | 'serviceGroups'>;

type FieldConfig = {
  field: TextField;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'tel' | 'email';
  inputMode?: 'numeric' | 'tel' | 'email';
  maxLength?: number;
};

const BUSINESS_FIELDS: FieldConfig[] = [
  { field: 'name', label: 'Tên khách hàng', placeholder: 'Tên đầy đủ theo đăng ký kinh doanh', required: true },
  { field: 'taxCode', label: 'Mã số thuế', placeholder: 'Nhập 10 hoặc 13 chữ số', required: true, inputMode: 'numeric', maxLength: 13 },
  { field: 'address', label: 'Địa chỉ', placeholder: 'Số nhà, đường, phường/xã, tỉnh/thành phố', required: true },
  { field: 'representative', label: 'Người đại diện', placeholder: 'Họ và tên người đại diện', required: true },
];

const CONTACT_FIELDS: FieldConfig[] = [
  { field: 'contactName', label: 'Người liên hệ chính', placeholder: 'Họ và tên người liên hệ' },
  { field: 'contactTitle', label: 'Chức vụ', placeholder: 'VD: Trưởng phòng Xuất nhập khẩu' },
  { field: 'phone', label: 'Điện thoại', placeholder: 'VD: 0901234567 hoặc +84901234567', type: 'tel', inputMode: 'tel' },
  { field: 'email', label: 'Email', placeholder: 'VD: lienhe@congty.vn', type: 'email', inputMode: 'email' },
];

const INPUT_RULES = [
  'Mã số thuế gồm 10 hoặc 13 chữ số, lưu dạng văn bản (giữ số 0 ở đầu).',
  'Không trùng mã số thuế với khách hàng đã có, kể cả khách đang Tạm ngưng.',
  'Cần ít nhất số điện thoại hoặc email.',
  'Điện thoại chỉ gồm chữ số, dấu + chỉ đặt ở đầu; email đúng cú pháp.',
];

/** UC-CUS-01 · Tạo hồ sơ khách hàng – frame 01.1 → 01.6; lưu thành công chuyển sang 01.7. */
export function CustomerCreatePage() {
  const { user, can } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const options = useMemo(() => {
    const { customerGroups, serviceGroups } = customersApi.getFormOptions();
    const toOption = ({ code, label }: { code: string; label: string }) => ({ value: code, label });
    return { customerGroups: customerGroups.map(toOption), serviceGroups: serviceGroups.map(toOption) };
  }, []);

  const form = useCreateCustomerForm({
    onCreated: ({ customer, replayed }) => {
      const state: CustomerDetailState = { created: true, replayed };
      // Thay mục lịch sử để "Quay lại" không mở lại biểu mẫu đã lưu.
      navigate(ROUTES.customerDetail(customer.code), { replace: true, state });
    },
    onSessionEnded: endSession,
  });
  const { values, errors, submitting } = form;
  useUnsavedChanges(form.dirty ? `Tạo khách hàng – ${values.name.trim() || 'chưa nhập tên'}` : null);

  if (!user) return null;

  async function save() {
    const outcome = await form.submit();
    if (outcome === 'invalid' || outcome === 'rejected') {
      // Đưa con trỏ tới trường lỗi đầu tiên sau khi lỗi được hiển thị.
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  // A4: chưa nhập gì thì rời ngay; đã có thay đổi thì hỏi xác nhận (01.5).
  function requestLeave(target: string) {
    if (form.dirty) setLeaveTarget(target);
    else navigate(target);
  }

  function renderField(config: FieldConfig) {
    return (
      <InputField
        key={config.field}
        label={config.label}
        required={config.required}
        placeholder={config.placeholder}
        type={config.type ?? 'text'}
        inputMode={config.inputMode}
        maxLength={config.maxLength}
        autoComplete="off"
        value={values[config.field]}
        error={errors[config.field]}
        disabled={submitting}
        onChange={(e) => form.setField(config.field, e.target.value)}
      />
    );
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khách hàng</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Tạo khách hàng
        </span>
      </nav>

      <div className="page-header page-header--customer">
        <div className="page-header__title">
          <h1>Tạo khách hàng</h1>
          <p>Trường có dấu * là bắt buộc. Cần ít nhất một phương thức liên hệ: điện thoại hoặc email.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={() => requestLeave(ROUTES.customers)}>
            Hủy
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting} className={submitting ? 'is-busy' : undefined}>
            {submitting ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </div>

      {form.alert && (
        <CreateCustomerAlertBanner
          alert={form.alert}
          canViewExisting={can('customers.view')}
          retrying={submitting}
          onOpenExisting={(code) => requestLeave(ROUTES.customerDetail(code))}
          onRetry={() => void save()}
        />
      )}

      <div className="customer-layout">
        <form
          ref={formRef}
          id={FORM_ID}
          className="customer-card customer-form"
          noValidate
          onSubmit={handleSubmit}
          aria-busy={submitting}
        >
          <FormSection title="Thông tin doanh nghiệp" description="Tên và mã số thuế dùng để định danh khách hàng trên toàn hệ thống.">
            {BUSINESS_FIELDS.map(renderField)}
          </FormSection>

          <hr className="customer-card__divider" />

          <FormSection
            title="Thông tin liên hệ"
            description="Bắt buộc ít nhất một trong hai: điện thoại hoặc email. Người liên hệ chính và chức vụ nhập nếu có."
          >
            {CONTACT_FIELDS.map(renderField)}
          </FormSection>

          <hr className="customer-card__divider" />

          <FormSection title="Thông tin hợp tác" description="Không bắt buộc – bổ sung nếu có thông tin.">
            <SelectField
              label="Nhóm khách hàng"
              placeholder="Chọn nhóm khách hàng"
              options={options.customerGroups}
              value={values.customerGroup}
              disabled={submitting}
              onChange={(value) => form.setField('customerGroup', value)}
            />
            <MultiSelectField
              label="Nhóm dịch vụ quan tâm"
              placeholder="Chọn một hoặc nhiều nhóm dịch vụ"
              options={options.serviceGroups}
              value={values.serviceGroups}
              disabled={submitting}
              onChange={(value) => form.setField('serviceGroups', value)}
            />
          </FormSection>
        </form>

        <aside className="customer-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin quản lý</h2>
            <p className="side-card__subtitle">Do hệ thống gán, không nhập hoặc sửa trực tiếp tại biểu mẫu.</p>
            <div className="side-card__item">
              <span className="side-card__label">Mã khách hàng</span>
              <span className="side-card__value">Hệ thống cấp khi lưu</span>
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Trạng thái</span>
              <StatusBadge label="Hoạt động" tone="success" />
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Nhân viên phụ trách</span>
              <span className="side-card__value">{user.fullName} (người tạo hồ sơ)</span>
            </div>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Quy tắc nhập liệu</h2>
            <ul className="side-card__notes">
              {INPUT_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {leaveTarget && (
        <Dialog
          title="Rời biểu mẫu tạo khách hàng?"
          width={480}
          initialFocus="first"
          onClose={() => setLeaveTarget(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setLeaveTarget(null)}>
                Tiếp tục nhập
              </Button>
              <Button variant="danger" onClick={() => navigate(leaveTarget)}>
                Rời biểu mẫu
              </Button>
            </>
          }
        >
          <p className="dialog__body">
            Thông tin đã nhập sẽ không được lưu. Hệ thống không tạo hồ sơ khách hàng và không ghi lịch sử tạo.
          </p>
        </Dialog>
      )}
    </>
  );
}

type AlertBannerProps = {
  alert: CreateCustomerAlert;
  canViewExisting: boolean;
  retrying: boolean;
  onOpenExisting: (code: string) => void;
  onRetry: () => void;
};

/** Banner phía trên biểu mẫu cho các frame 01.2, 01.3, 01.4 và 01.6. */
function CreateCustomerAlertBanner({ alert, canViewExisting, retrying, onOpenExisting, onRetry }: AlertBannerProps) {
  const retryAction = (
    <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Đang kiểm tra…' : 'Kiểm tra kết quả và thử lại'}
    </button>
  );

  switch (alert.kind) {
    case 'invalid':
      return (
        <Alert tone="danger" title="Chưa thể lưu hồ sơ">
          Có {alert.count} trường cần kiểm tra lại. Các dữ liệu hợp lệ đã nhập được giữ nguyên.
        </Alert>
      );
    case 'no-contact':
      return (
        <Alert tone="danger" title="Chưa có phương thức liên hệ">
          Cần cung cấp ít nhất số điện thoại hoặc email trước khi lưu hồ sơ.
        </Alert>
      );
    case 'duplicate': {
      const { existing } = alert;
      const suspended = existing.status === 'suspended';
      return (
        <Alert
          tone="warning"
          title="Khách hàng đã tồn tại – không tạo hồ sơ mới"
          action={
            canViewExisting && (
              <button type="button" className="alert__link" onClick={() => onOpenExisting(existing.code)}>
                Mở hồ sơ hiện có
              </button>
            )
          }
        >
          Mã số thuế {existing.taxCode} thuộc {existing.code} · {existing.name}
          {suspended
            ? ' (đang Tạm ngưng). Hệ thống không tạo hồ sơ trùng và không tự kích hoạt lại. Hãy dùng hồ sơ hiện có và chuyển người có thẩm quyền xử lý theo UC-CUS-04.'
            : ' (đang Hoạt động). Hệ thống không tạo hồ sơ trùng. Hãy dùng hồ sơ hiện có.'}
        </Alert>
      );
    }
    case 'save-failed':
      return (
        <Alert tone="danger" title="Tạo khách hàng không thành công" action={retryAction}>
          Không lưu được hồ sơ hoặc lịch sử tạo, giao dịch dữ liệu đã được hoàn tác. Dữ liệu trên biểu mẫu được giữ lại.
          Nếu mất kết nối, hệ thống kiểm tra kết quả thao tác đã gửi trước khi cho thử lại.
        </Alert>
      );
    case 'network':
      return (
        <Alert tone="danger" title="Chưa nhận được kết quả lưu hồ sơ" action={retryAction}>
          Kết nối bị gián đoạn sau khi gửi yêu cầu nên chưa xác định được hồ sơ đã lưu hay chưa. Dữ liệu trên biểu mẫu
          được giữ lại; hệ thống kiểm tra kết quả thao tác đã gửi trước khi cho thử lại và không tạo hồ sơ trùng.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền tạo khách hàng">
          Quyền của tài khoản đã thay đổi nên hồ sơ chưa được lưu. Liên hệ Quản trị hệ thống nếu cần tiếp tục.
        </Alert>
      );
  }
}
