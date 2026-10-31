import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { areasApi } from '../api/areasApi';
import { HIERARCHY_RULES, HierarchyChain, type ChainNode } from '../components/HierarchyChain';
import { ParentAreaField } from '../components/ParentAreaField';
import { ParentAreaPicker } from '../components/ParentAreaPicker';
import { useCreateAreaForm, type CreateAreaAlert } from '../hooks/useCreateAreaForm';
import type { Area, AreaTypeCode, CapacityUnit } from '../types/area';
import { AREA_TYPES, CAPACITY_UNITS } from '../utils/areaFormat';
import { ancestryOf, levelUnder, pathUnder, PENDING_AREA_CODE } from '../utils/areaHierarchy';
import { AREA_CODE_MAX_LENGTH, AREA_NAME_MAX_LENGTH } from '../utils/areaValidation';
import type { AreaDetailState } from './AreaDetailPage';
import './Areas.css';

const FORM_ID = 'create-area-form';

const INPUT_RULES = [
  'Mã khu vực duy nhất trên toàn hệ thống (ARE-01).',
  'Tên khu vực không trùng trong cùng khu vực cấp cha trực tiếp (ARE-02).',
  'Bắt buộc: Tên khu vực, Loại mặt bằng. Mã để trống sẽ được hệ thống tự cấp.',
  'Diện tích, sức chứa thiết kế là số dương lớn hơn 0.',
  'Hệ thống ghi nhật ký người tạo, thời điểm và thông số ban đầu (ARE-11).',
];

/**
 * UC-ARE-01 · Tạo mới khu vực khai thác (01.1 → 01.6), gồm bước chọn khu vực cấp cha của UC-ARE-02 (02.1 → 02.6).
 * Lưu thành công chuyển sang chi tiết khu vực.
 */
export function AreaCreatePage() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Đã xác nhận hoặc bỏ chọn khu vực cha trên sơ đồ → hiển thị xem trước phân cấp (02.2 / 02.3).
  const [hierarchyTouched, setHierarchyTouched] = useState(false);
  // Đọc lại sơ đồ mỗi lần mở hộp thoại để thấy khu vực vừa được tạo/điều chỉnh.
  const [tree, setTree] = useState<Area[]>(() => areasApi.getTree());

  const form = useCreateAreaForm({
    onCreated: ({ area, replayed }) => {
      const state: AreaDetailState = { created: true, replayed };
      navigate(ROUTES.areaDetail(area.code), { replace: true, state });
    },
    onSessionEnded: endSession,
  });
  const { values, errors, submitting } = form;
  useUnsavedChanges(form.dirty ? `Tạo khu vực – ${values.name.trim() || 'chưa nhập tên'}` : null);

  const parent = useMemo(() => tree.find((a) => a.code === values.parentCode) ?? null, [tree, values.parentCode]);
  const ownCode = values.code.trim().toUpperCase() || PENDING_AREA_CODE;
  const level = levelUnder(parent);
  const path = pathUnder(parent, ownCode);

  if (!user) return null;

  async function save() {
    const outcome = await form.submit();
    if (outcome === 'invalid' || outcome === 'rejected') {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  // A3: chưa nhập gì thì rời ngay; đã nhập thì hỏi xác nhận (01.4).
  function requestLeave(target: string) {
    if (form.dirty) setLeaveTarget(target);
    else navigate(target);
  }

  function openPicker() {
    setTree(areasApi.getTree());
    setPickerOpen(true);
  }

  const chain: ChainNode[] = [
    ...(parent ? ancestryOf(tree, parent.code) : []).map((a, index, list) => ({
      code: a.code,
      name: a.name,
      level: a.level,
      note: index === list.length - 1 ? 'Khu vực cấp cha' : undefined,
    })),
    { code: ownCode, name: values.name.trim() || 'Khu vực mới', level, note: 'Chưa lưu' },
  ];

  const parentHint = !parent
    ? 'Không bắt buộc – để trống: Level = 1, ParentAreaId = NULL (A3). Chọn trên sơ đồ phân cấp (UC-ARE-02).'
    : hierarchyTouched
      ? `Khu vực mới sẽ ở Cấp ${level} · ${path}`
      : 'Không bắt buộc – chọn trên sơ đồ phân cấp (UC-ARE-02).';

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khu vực khai thác</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Tạo khu vực
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <h1>Tạo khu vực khai thác</h1>
          <p>Trường có dấu * là bắt buộc. Để trống Mã khu vực để hệ thống tự cấp mã.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={() => requestLeave(ROUTES.areas)}>
            Hủy
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting} className={submitting ? 'is-busy' : undefined}>
            {submitting ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </Button>
        </div>
      </div>

      {form.alert ? (
        <CreateAreaAlertBanner
          alert={form.alert}
          retrying={submitting}
          onOpenArea={(code) => requestLeave(ROUTES.areaDetail(code))}
          onRetry={() => void save()}
        />
      ) : (
        hierarchyTouched &&
        (parent ? (
          <Alert tone="info" title={`Đã chọn khu vực cấp cha: ${parent.name} (Cấp ${parent.level})`}>
            Hệ thống tính Level = {parent.level} + 1 = {level} và đường dẫn {path}. Cấu trúc phân cấp được ghi nhận khi chọn "Lưu hồ
            sơ".
          </Alert>
        ) : (
          <Alert tone="info" title="Khu vực sẽ được tạo ở Cấp 1">
            Không chọn khu vực cấp cha nên hệ thống gán Cấp 1 – cấp cao nhất (ParentAreaId để trống). Có thể tạo phân khu Cấp 2 và
            Cấp 3 bên dưới khu vực này.
          </Alert>
        ))
      )}

      <div className="area-layout">
        <form ref={formRef} id={FORM_ID} className="area-card area-form" noValidate onSubmit={handleSubmit} aria-busy={submitting}>
          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Thông tin định danh</h2>
              <p>Mã khu vực là duy nhất trên toàn hệ thống; tên không trùng trong cùng khu vực cấp cha trực tiếp.</p>
            </div>
            <div className="area-form__grid">
              <InputField
                label="Mã khu vực"
                placeholder="VD: KV-CL-B1-A3"
                autoComplete="off"
                maxLength={AREA_CODE_MAX_LENGTH}
                value={values.code}
                error={errors.code}
                hint="Không bắt buộc – để trống, hệ thống tự cấp mã dạng KV-XXXXXX."
                disabled={submitting}
                onChange={(e) => form.setField('code', e.target.value)}
              />
              <InputField
                label="Tên khu vực"
                required
                placeholder="Nhập tên khu vực"
                autoComplete="off"
                maxLength={AREA_NAME_MAX_LENGTH}
                value={values.name}
                error={errors.name}
                disabled={submitting}
                onChange={(e) => form.setField('name', e.target.value)}
              />
              <SelectField
                label="Loại mặt bằng"
                required
                placeholder="Chọn loại mặt bằng"
                options={AREA_TYPES}
                value={values.type}
                error={errors.type}
                disabled={submitting}
                onChange={(value) => form.setField('type', value as AreaTypeCode | '')}
              />
              <ParentAreaField
                parent={parent}
                highlighted={hierarchyTouched}
                hint={parentHint}
                error={errors.parentCode}
                disabled={submitting}
                onOpen={openPicker}
                onClear={() => {
                  form.setField('parentCode', '');
                  setHierarchyTouched(true);
                }}
              />
            </div>
          </section>

          <hr className="area-card__divider" />

          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Vị trí &amp; thông số kỹ thuật</h2>
              <p>Diện tích và sức chứa thiết kế (nếu nhập) phải là số dương lớn hơn 0.</p>
            </div>
            <div className="area-form__grid">
              <InputField
                label="Tọa độ GPS"
                placeholder="VD: 10.76215, 106.78694"
                autoComplete="off"
                value={values.gps}
                disabled={submitting}
                onChange={(e) => form.setField('gps', e.target.value)}
              />
              <InputField
                label="Diện tích mặt bằng (m²)"
                placeholder="VD: 12.500"
                inputMode="decimal"
                autoComplete="off"
                value={values.areaSize}
                error={errors.areaSize}
                disabled={submitting}
                onChange={(e) => form.setField('areaSize', e.target.value)}
              />
              <InputField
                label="Sức chứa thiết kế"
                placeholder="VD: 1.800"
                inputMode="decimal"
                autoComplete="off"
                value={values.capacity}
                error={errors.capacity}
                disabled={submitting}
                onChange={(e) => form.setField('capacity', e.target.value)}
              />
              <SelectField
                label="Đơn vị sức chứa"
                placeholder="Chọn đơn vị"
                options={CAPACITY_UNITS}
                value={values.capacityUnit}
                disabled={submitting}
                onChange={(value) => value && form.setField('capacityUnit', value as CapacityUnit)}
              />
            </div>
          </section>

          <hr className="area-card__divider" />

          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Quy chuẩn kỹ thuật</h2>
              <p>Không bắt buộc – tải trọng nền, quy cách xếp tầng, hạ tầng đi kèm.</p>
            </div>
            <TextAreaField
              label="Mô tả quy chuẩn kỹ thuật"
              placeholder="VD: Nền bê tông chịu tải 25 tấn/m²; xếp tối đa 5 tầng container rỗng…"
              value={values.standards}
              disabled={submitting}
              onChange={(e) => form.setField('standards', e.target.value)}
            />
          </section>
        </form>

        <aside className="area-layout__side">
          {hierarchyTouched ? (
            <>
              <section className="side-card">
                <h2 className="side-card__title">Vị trí trong sơ đồ phân cấp</h2>
                <p className="side-card__subtitle">Xem trước – ghi nhận khi lưu hồ sơ.</p>
                <HierarchyChain nodes={chain} />
                <div className="side-card__item">
                  <span className="side-card__label">Đường dẫn phân cấp (HierarchyPath)</span>
                  <span className="side-card__value">{path}</span>
                </div>
              </section>
              <RulesCard title="Quy tắc phân cấp" rules={HIERARCHY_RULES} />
            </>
          ) : (
            <>
              <section className="side-card">
                <h2 className="side-card__title">Thông tin quản lý</h2>
                <p className="side-card__subtitle">Do hệ thống gán khi lưu, không nhập hoặc sửa trực tiếp tại biểu mẫu.</p>
                <div className="side-card__item">
                  <span className="side-card__label">Mã khu vực</span>
                  <span className="side-card__value">Theo mã đã nhập (tự cấp KV-XXXXXX nếu để trống)</span>
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Trạng thái</span>
                  <StatusBadge label="Hoạt động" tone="success" />
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Cấp phân cấp</span>
                  <span className="side-card__value">{parent ? `Cấp ${level} – tính từ khu vực cấp cha` : 'Cấp 1 – chưa chọn khu vực cấp cha'}</span>
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Đường dẫn phân cấp</span>
                  <span className="side-card__value">{path}</span>
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Người tạo</span>
                  <span className="side-card__value">{user.fullName} – ghi nhật ký khi lưu</span>
                </div>
              </section>
              <RulesCard title="Quy tắc nhập liệu" rules={INPUT_RULES} />
            </>
          )}
        </aside>
      </div>

      {pickerOpen && (
        <ParentAreaPicker
          areas={tree}
          target={{ kind: 'new', name: values.name, code: values.code }}
          initialParentCode={values.parentCode}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(picked) => {
            form.setField('parentCode', picked.code);
            setHierarchyTouched(true);
            setPickerOpen(false);
          }}
        />
      )}

      {leaveTarget && (
        <Dialog
          title="Hủy tạo khu vực?"
          width={480}
          initialFocus="first"
          onClose={() => setLeaveTarget(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setLeaveTarget(null)}>
                Tiếp tục nhập
              </Button>
              <Button variant="danger" onClick={() => navigate(leaveTarget)}>
                Hủy tạo khu vực
              </Button>
            </>
          }
        >
          <p className="dialog__body">
            Thông tin đã nhập sẽ không được lưu. Hệ thống không tạo hồ sơ khu vực và{' '}
            {leaveTarget === ROUTES.areas ? 'quay lại danh sách khu vực.' : 'mở hồ sơ khu vực đã chọn.'}
          </p>
        </Dialog>
      )}
    </>
  );
}

function RulesCard({ title, rules }: { title: string; rules: string[] }) {
  return (
    <section className="side-card">
      <h2 className="side-card__title">{title}</h2>
      <ul className="side-card__notes">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </section>
  );
}

type AlertBannerProps = {
  alert: CreateAreaAlert;
  retrying: boolean;
  onOpenArea: (code: string) => void;
  onRetry: () => void;
};

/** Banner phía trên biểu mẫu cho các frame 01.2, 01.3, 01.5 và lỗi kiểm tra lại ở server. */
function CreateAreaAlertBanner({ alert, retrying, onOpenArea, onRetry }: AlertBannerProps) {
  switch (alert.kind) {
    case 'invalid':
      return (
        <Alert tone="danger" title={`Chưa thể lưu hồ sơ khu vực – ${alert.count} trường cần kiểm tra`}>
          Vui lòng điền đầy đủ các thông tin bắt buộc. Diện tích và sức chứa thiết kế phải là số dương lớn hơn 0.
        </Alert>
      );
    case 'duplicate-name': {
      const { existing, parent } = alert;
      const owner = parent ? `${parent.name} (${parent.code}) đã có phân khu` : 'Cấp 1 đã có khu vực';
      return (
        <Alert
          tone="warning"
          title="Tên khu vực đã tồn tại trong cùng khu vực trực thuộc"
          action={
            <button type="button" className="alert__link" onClick={() => onOpenArea(existing.code)}>
              Xem {existing.name} ({existing.code})
            </button>
          }
        >
          {owner} "{existing.name}". Tên chỉ được trùng với khu vực thuộc khu vực cấp cha khác.
        </Alert>
      );
    }
    case 'duplicate-code':
      return (
        <Alert
          tone="danger"
          title="Mã khu vực đã tồn tại trên toàn hệ thống"
          action={
            <button type="button" className="alert__link" onClick={() => onOpenArea(alert.existing.code)}>
              Xem {alert.existing.name} ({alert.existing.code})
            </button>
          }
        >
          Mã {alert.code} đang được dùng (ARE-01). Nhập mã khác hoặc để trống để hệ thống tự cấp mã.
        </Alert>
      );
    case 'invalid-parent':
      return (
        <Alert tone="danger" title="Khu vực cấp cha không còn hợp lệ">
          Sơ đồ phân cấp đã thay đổi sau khi bạn chọn. Vui lòng mở lại "Khu vực cấp cha" và chọn khu vực Cấp 1 hoặc Cấp 2.
        </Alert>
      );
    case 'save-failed':
      return (
        <Alert
          tone="danger"
          title="Không lưu được hồ sơ khu vực"
          action={
            <button type="button" className="alert__link" disabled={retrying} onClick={onRetry}>
              {retrying ? 'Đang kiểm tra…' : 'Kiểm tra kết quả và thử lại'}
            </button>
          }
        >
          Hệ thống chưa kết nối được cơ sở dữ liệu nên hồ sơ chưa được ghi nhận. Dữ liệu bạn nhập vẫn được giữ nguyên, vui lòng thử lại
          sau.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền tạo khu vực">
          Quyền của tài khoản đã thay đổi nên hồ sơ chưa được lưu. Liên hệ Quản trị hệ thống nếu cần tiếp tục.
        </Alert>
      );
  }
}
