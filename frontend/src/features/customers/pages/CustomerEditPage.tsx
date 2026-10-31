import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { InputField } from '@/components/form/InputField';
import { MultiSelectField, SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { customersApi } from '../api/customersApi';
import { CustomerConflictDialog, UnsavedChangesCard } from '../components/CustomerChangePanels';
import type { CustomerCatalogs } from '../components/customerFormat';
import { FormSection } from '../components/FormSection';
import { useEditCustomerForm, type EditCustomerAlert } from '../hooks/useEditCustomerForm';
import type { Customer, EditableCustomerField } from '../types/customer';
import { CUSTOMER_FIELD_LABELS } from '../utils/customerChanges';
import { CUSTOMER_STATUS_BADGE, type CustomerDetailState } from './CustomerDetailPage';
import './CustomerPages.css';

const FORM_ID = 'edit-customer-form';

type TextField = Exclude<EditableCustomerField, 'customerGroup' | 'serviceGroups'>;

type FieldConfig = {
  field: TextField;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'tel' | 'email';
  inputMode?: 'tel' | 'email';
};

const CONTACT_FIELDS: FieldConfig[] = [
  { field: 'contactName', placeholder: 'Họ và tên người liên hệ' },
  { field: 'contactTitle', placeholder: 'VD: Trưởng phòng Xuất nhập khẩu' },
  { field: 'phone', placeholder: 'VD: 0901234567 hoặc +84901234567', type: 'tel', inputMode: 'tel' },
  { field: 'email', placeholder: 'VD: lienhe@congty.vn', type: 'email', inputMode: 'email' },
];

const LOCKED_NOTES = [
  'Mã số thuế: theo quy trình riêng nếu doanh nghiệp có yêu cầu (A3.1).',
  'Trạng thái: qua UC-CUS-03 / UC-CUS-04 bởi người có thẩm quyền (A3.2).',
  'Nhân viên phụ trách: theo quy trình phân công riêng (A3.3).',
];

/** UC-CUS-02 · Cập nhật thông tin khách hàng – frame 02.1 → 02.8; lưu thành công chuyển sang 02.9. */
export function CustomerEditPage() {
  const { code = '' } = useParams();
  const customer = customersApi.getCustomer(code);

  if (!customer) {
    return (
      <>
        <nav className="breadcrumb" aria-label="Đường dẫn">
          <Link to={ROUTES.customers}>Khách hàng</Link>
          <span className="breadcrumb__separator">/</span>
          <span className="breadcrumb__current" aria-current="page">
            {code}
          </span>
        </nav>
        <Alert tone="warning" title="Không mở được hồ sơ khách hàng">
          Không có khách hàng mã {code} hoặc bạn không có quyền cập nhật hồ sơ này.
        </Alert>
        <div>
          <ButtonLink to={ROUTES.customers} variant="secondary">
            Về danh sách
          </ButtonLink>
        </div>
      </>
    );
  }
  // Mỗi hồ sơ một trạng thái biểu mẫu riêng.
  return <CustomerEditForm key={customer.code} customer={customer} />;
}

function CustomerEditForm({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { endSession } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const catalogs: CustomerCatalogs = useMemo(() => customersApi.getFormOptions(), []);
  const options = useMemo(() => {
    const toOption = ({ code, label }: { code: string; label: string }) => ({ value: code, label });
    return { customerGroups: catalogs.customerGroups.map(toOption), serviceGroups: catalogs.serviceGroups.map(toOption) };
  }, [catalogs]);

  const form = useEditCustomerForm(customer, {
    onUpdated: ({ customer: updated, changedFields, replayed }) => {
      const state: CustomerDetailState = { updated: true, changedFields, replayed };
      // Thay mục lịch sử để "Quay lại" không mở lại biểu mẫu đã lưu.
      navigate(ROUTES.customerDetail(updated.code), { replace: true, state });
    },
    onSessionEnded: endSession,
  });
  const { baseline, values, errors, submitting, changedFields } = form;
  useUnsavedChanges(form.dirty ? `Chỉnh sửa khách hàng – ${baseline.code}` : null);
  const detailPath = ROUTES.customerDetail(baseline.code);
  const badge = CUSTOMER_STATUS_BADGE[baseline.status];

  async function save() {
    const outcome = await form.submit();
    if (outcome === 'invalid') {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  // A3.5: đã thay đổi thì hỏi xác nhận (02.5), chưa sửa gì thì đóng ngay.
  function requestCancel() {
    if (form.dirty) setConfirmCancel(true);
    else navigate(detailPath);
  }

  function textField(config: FieldConfig) {
    return (
      <InputField
        key={config.field}
        label={CUSTOMER_FIELD_LABELS[config.field]}
        required={config.required}
        placeholder={config.placeholder}
        type={config.type ?? 'text'}
        inputMode={config.inputMode}
        autoComplete="off"
        value={values[config.field]}
        error={errors[config.field]}
        changed={changedFields.has(config.field)}
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
        <span>{baseline.code}</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Chỉnh sửa
        </span>
      </nav>

      <div className="page-header page-header--customer">
        <div className="page-header__title">
          <div className="customer-title">
            <h1>Chỉnh sửa thông tin khách hàng</h1>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <p>
            {baseline.name} · {baseline.code} · Đang sửa phiên bản {baseline.version}
          </p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={requestCancel}>
            Hủy
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting} className={submitting ? 'is-busy' : undefined}>
            {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>

      {form.alert && (
        <EditCustomerAlertBanner alert={form.alert} version={baseline.version} retrying={submitting} onRetry={() => void save()} />
      )}
      {baseline.status === 'suspended' && (
        <Alert tone="info" title="Khách hàng đang Tạm ngưng">
          Bạn vẫn cập nhật được thông tin vì có quyền trên hồ sơ. Việc cập nhật không thay đổi trạng thái Tạm ngưng và không
          gỡ hạn chế phát sinh giao dịch dịch vụ mới.
        </Alert>
      )}

      <div className="customer-layout">
        <form ref={formRef} id={FORM_ID} className="customer-card customer-form" noValidate onSubmit={handleSubmit} aria-busy={submitting}>
          <FormSection title="Thông tin doanh nghiệp">
            {textField({ field: 'name', placeholder: 'Tên đầy đủ theo đăng ký kinh doanh', required: true })}
            <InputField
              label={CUSTOMER_FIELD_LABELS.taxCode}
              value={baseline.taxCode}
              disabled
              readOnly
              hint="Chỉ đọc. Sai MST hoặc đổi pháp nhân xử lý theo quy trình riêng."
              trailing={<Icon name="lock" size={16} className="field__lock" />}
            />
            {textField({ field: 'address', placeholder: 'Số nhà, đường, phường/xã, tỉnh/thành phố', required: true })}
            {textField({ field: 'representative', placeholder: 'Họ và tên người đại diện', required: true })}
          </FormSection>

          <hr className="customer-card__divider" />

          <FormSection title="Thông tin liên hệ" description="Phải giữ ít nhất một phương thức liên hệ hợp lệ: điện thoại hoặc email.">
            {CONTACT_FIELDS.map(textField)}
          </FormSection>

          <hr className="customer-card__divider" />

          <FormSection title="Thông tin hợp tác">
            <SelectField
              label={CUSTOMER_FIELD_LABELS.customerGroup}
              placeholder="Chọn nhóm khách hàng"
              options={options.customerGroups}
              value={values.customerGroup}
              changed={changedFields.has('customerGroup')}
              disabled={submitting}
              onChange={(value) => form.setField('customerGroup', value)}
            />
            <MultiSelectField
              label={CUSTOMER_FIELD_LABELS.serviceGroups}
              placeholder="Chọn một hoặc nhiều nhóm dịch vụ"
              options={options.serviceGroups}
              value={values.serviceGroups}
              changed={changedFields.has('serviceGroups')}
              disabled={submitting}
              onChange={(value) => form.setField('serviceGroups', value)}
            />
          </FormSection>

          <hr className="customer-card__divider" />

          <FormSection title="Lý do / căn cứ thay đổi" description="Bắt buộc – được lưu cùng lịch sử thay đổi để truy vết." layout="stack">
            <TextAreaField
              label="Lý do hoặc căn cứ"
              required
              placeholder="Nhập lý do hoặc căn cứ thay đổi"
              value={form.reason}
              error={errors.reason}
              disabled={submitting}
              onChange={(e) => form.setReason(e.target.value)}
            />
          </FormSection>
        </form>

        <aside className="customer-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin quản lý</h2>
            <p className="side-card__subtitle">Chỉ đọc tại biểu mẫu này.</p>
            <div className="side-card__item">
              <span className="side-card__label">Mã khách hàng</span>
              <span className="side-card__value">{baseline.code}</span>
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Trạng thái</span>
              <StatusBadge label={badge.label} tone={badge.tone} />
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Nhân viên phụ trách</span>
              <span className="side-card__value">{baseline.ownerName}</span>
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Phiên bản đang sửa</span>
              <span className="side-card__value">{baseline.version}</span>
            </div>
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Không thay đổi tại đây</h2>
            <ul className="locked-notes">
              {LOCKED_NOTES.map((note) => (
                <li key={note}>
                  <Icon name="lock" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>
          <UnsavedChangesCard changes={form.changes} catalogs={catalogs} />
        </aside>
      </div>

      {confirmCancel && (
        <Dialog
          title="Hủy chỉnh sửa?"
          width={480}
          initialFocus="first"
          onClose={() => setConfirmCancel(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                Tiếp tục chỉnh sửa
              </Button>
              <Button variant="danger" onClick={() => navigate(detailPath)}>
                Hủy chỉnh sửa
              </Button>
            </>
          }
        >
          <p className="dialog__body">
            Các thay đổi chưa lưu sẽ bị bỏ. Hồ sơ giữ nguyên dữ liệu và phiên bản {baseline.version}, không ghi lịch sử thay
            đổi.
          </p>
        </Dialog>
      )}

      {form.conflict && (
        <CustomerConflictDialog
          conflict={form.conflict}
          base={baseline}
          values={values}
          catalogs={catalogs}
          onDiscard={() => navigate(detailPath)}
          onReload={form.reloadLatest}
          onClose={form.closeConflict}
        />
      )}
    </>
  );
}

type AlertBannerProps = {
  alert: EditCustomerAlert;
  version: number;
  retrying: boolean;
  onRetry: () => void;
};

/** Banner phía trên biểu mẫu cho các frame 02.2, 02.3, 02.6, 02.8 và sau khi tải lại bản mới nhất (02.4). */
function EditCustomerAlertBanner({ alert, version, retrying, onRetry }: AlertBannerProps) {
  const retryAction = (
    <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>
      {retrying ? 'Đang kiểm tra…' : 'Kiểm tra kết quả và thử lại'}
    </button>
  );

  switch (alert.kind) {
    case 'invalid':
      return (
        <Alert tone="danger" title="Chưa lưu thay đổi">
          Có {alert.count} trường cần kiểm tra lại. Các thông tin hợp lệ đã nhập được giữ trên biểu mẫu; dữ liệu đã lưu
          (phiên bản {version}) không đổi.
        </Alert>
      );
    case 'no-contact':
      return (
        <Alert tone="danger" title="Cần giữ ít nhất một phương thức liên hệ">
          Bạn đã xóa cả số điện thoại và email. Hệ thống không lưu cho đến khi có ít nhất một phương thức liên hệ hợp lệ.
        </Alert>
      );
    case 'no-changes':
      return (
        <Alert tone="info" title="Không có nội dung cần cập nhật">
          Dữ liệu trên biểu mẫu không khác phiên bản đang lưu (phiên bản {version}). Phiên bản được giữ nguyên và không tạo
          lịch sử thay đổi.
        </Alert>
      );
    case 'save-failed':
      return (
        <Alert tone="danger" title="Cập nhật không thành công" action={retryAction}>
          Không lưu được thông tin hoặc lịch sử thay đổi, giao dịch đã được hoàn tác; dữ liệu và phiên bản {version} giữ
          nguyên. Nếu mất kết nối, hệ thống kiểm tra kết quả thao tác đã gửi trước khi cho xử lý lại.
        </Alert>
      );
    case 'network':
      return (
        <Alert tone="danger" title="Chưa nhận được kết quả cập nhật" action={retryAction}>
          Kết nối bị gián đoạn sau khi gửi yêu cầu nên chưa xác định được thay đổi đã lưu hay chưa. Hệ thống kiểm tra kết
          quả thao tác đã gửi trước khi cho xử lý lại, không áp lại trên phiên bản mới và không ghi lịch sử trùng.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền cập nhật khách hàng">
          Quyền của tài khoản đã thay đổi nên thay đổi chưa được lưu. Liên hệ Quản trị hệ thống nếu cần tiếp tục.
        </Alert>
      );
    case 'not-found':
      return (
        <Alert tone="danger" title="Không thể cập nhật hồ sơ">
          Khách hàng không còn tồn tại hoặc không thuộc phạm vi được phép; hệ thống không lưu thay đổi.
        </Alert>
      );
    case 'immutable':
      return (
        <Alert tone="danger" title="Yêu cầu cập nhật bị từ chối">
          Mã khách hàng, mã số thuế, trạng thái và nhân viên phụ trách không được sửa tại biểu mẫu này; toàn bộ thay đổi
          chưa được lưu.
        </Alert>
      );
    case 'reloaded':
      return (
        <Alert tone="info" title={`Đã tải phiên bản ${alert.version} mới nhất`}>
          Thay đổi của bạn ở các trường người khác không sửa được giữ lại để đối chiếu; hãy kiểm tra trước khi lưu.
          {alert.overlapped.length > 0 &&
            ` Trường ${alert.overlapped.map((f) => CUSTOMER_FIELD_LABELS[f]).join(', ')} đã được người khác cập nhật nên lấy theo bản mới nhất.`}
        </Alert>
      );
  }
}
