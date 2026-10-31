import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { areasApi } from '../api/areasApi';
import { ParentAreaField } from '../components/ParentAreaField';
import { ParentAreaPicker } from '../components/ParentAreaPicker';
import { useEditAreaForm, type EditAreaAlert } from '../hooks/useEditAreaForm';
import type { Area, AreaConflict, AreaField, AreaTypeCode, CapacityUnit } from '../types/area';
import { AREA_FIELD_LABELS, currentVersionEntry, diffAreaDraft, toAreaDraft } from '../utils/areaChanges';
import { AREA_STATUS_BADGE, AREA_TYPES, CAPACITY_UNITS, describeReferences } from '../utils/areaFormat';
import { levelUnder, pathUnder } from '../utils/areaHierarchy';
import { AREA_CODE_MAX_LENGTH, AREA_NAME_MAX_LENGTH } from '../utils/areaValidation';
import { AreaNotFound, type AreaDetailState } from './AreaDetailPage';
import './Areas.css';

const FORM_ID = 'edit-area-form';

const OUT_OF_SCOPE_NOTES = [
  'Trạng thái Hoạt động / Tạm ngưng – thao tác riêng trên hồ sơ khu vực.',
  'Thông tin khu vực đã lưu trên bảng giá, hợp đồng, phiếu sản lượng đã phát sinh giữ nguyên (ARE-08).',
  'Phân công nhân sự, gán dịch vụ – thao tác riêng.',
];

/** UC-ARE-04 · Cập nhật thông tin và quy chuẩn kỹ thuật khu vực (04.1 → 04.8), mở từ "Chỉnh sửa ▾" tại chi tiết khu vực. */
export function AreaEditPage() {
  const { code = '' } = useParams();
  const area = areasApi.getArea(code);
  if (!area) return <AreaNotFound />;
  return <EditAreaForm key={area.id} area={area} />;
}

function EditAreaForm({ area }: { area: Area }) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [tree, setTree] = useState<Area[]>(() => areasApi.getTree());

  const form = useEditAreaForm({
    area,
    onUpdated: (result) => {
      const entry = result.area.history[result.area.history.length - 1];
      const state: AreaDetailState = {
        replayed: result.replayed,
        updated: { changes: result.changes, version: result.area.version, reason: entry.reason ?? '', by: entry.by, at: entry.at },
        hierarchy: result.pathChanges.length > 0 ? { changes: result.pathChanges, previousParent: result.previousParent } : undefined,
      };
      navigate(ROUTES.areaDetail(result.area.code), { replace: true, state });
    },
    onSessionEnded: endSession,
  });
  const { original, initial, values, errors, submitting, changes } = form;
  useUnsavedChanges(form.dirty ? `Chỉnh sửa khu vực ${original.code}` : null);

  const parent = useMemo(() => tree.find((a) => a.code === values.parentCode) ?? null, [tree, values.parentCode]);
  const changed = useMemo(() => new Set<AreaField>(changes.map((c) => c.field)), [changes]);
  const before = (field: AreaField) => changes.find((c) => c.field === field)?.before;
  const versionEntry = currentVersionEntry(original);
  const badge = AREA_STATUS_BADGE[original.status];

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

  // A5: chưa có thay đổi thì đóng ngay; có thay đổi thì hỏi xác nhận (04.6).
  function requestLeave(target: string) {
    if (form.dirty) setLeaveTarget(target);
    else navigate(target);
  }

  const parentHint = changed.has('parentCode')
    ? `Khu vực sẽ ở Cấp ${levelUnder(parent)} · ${pathUnder(parent, values.code.trim().toUpperCase() || original.code)}`
    : 'Điều chỉnh phân cấp theo UC-ARE-02.';

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khu vực khai thác</span>
        <span className="breadcrumb__separator">/</span>
        <Link to={ROUTES.areas}>Danh sách khu vực</Link>
        <span className="breadcrumb__separator">/</span>
        <Link to={ROUTES.areaDetail(original.code)}>{original.code}</Link>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Chỉnh sửa
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <div className="area-title">
            <h1>Chỉnh sửa khu vực</h1>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <p>
            {original.name} · {original.code} · Cấp {original.level} · Đang sửa phiên bản {original.version}
          </p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" disabled={submitting} onClick={() => requestLeave(ROUTES.areaDetail(original.code))}>
            Hủy
          </Button>
          <Button type="submit" form={FORM_ID} disabled={submitting} className={submitting ? 'is-busy' : undefined}>
            {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>

      {form.alert ? (
        <EditAreaAlertBanner
          alert={form.alert}
          originalCode={original.code}
          onOpenArea={(target) => requestLeave(ROUTES.areaDetail(target))}
          onShowConflict={() => setConflictOpen(true)}
        />
      ) : form.referenceText ? (
        <Alert tone="info" title="Khu vực đã phát sinh dữ liệu giao dịch – Mã khu vực bị khóa">
          Có {form.referenceText.replace(/ · /g, ', ')} tham chiếu {original.code} (ARE-07). Thay đổi không làm đổi thông tin khu vực đã
          lưu trên các hồ sơ này (ARE-08).
        </Alert>
      ) : (
        <Alert tone="info" title="Khu vực chưa phát sinh dữ liệu giao dịch – được phép sửa Mã khu vực">
          Chưa có bảng giá, hợp đồng hay phiếu sản lượng tham chiếu {original.code}. Mã mới vẫn phải duy nhất trên toàn hệ thống
          (ARE-01).
        </Alert>
      )}

      <div className="area-layout">
        <form ref={formRef} id={FORM_ID} className="area-card area-form" noValidate onSubmit={handleSubmit} aria-busy={submitting}>
          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Thông tin định danh</h2>
              <p>Tên không trùng với khu vực khác cùng khu vực cấp cha trực tiếp (ARE-02).</p>
            </div>
            <div className="area-form__grid">
              <InputField
                label="Mã khu vực"
                autoComplete="off"
                maxLength={AREA_CODE_MAX_LENGTH}
                value={values.code}
                error={errors.code}
                changed={changed.has('code')}
                disabled={submitting || form.codeLocked}
                hint={
                  form.codeLocked
                    ? 'Đã phát sinh bảng giá, hợp đồng, sản lượng – không được sửa mã (ARE-07).'
                    : changed.has('code')
                      ? `Trước: ${before('code')}`
                      : 'Chưa phát sinh giao dịch – được phép sửa; mã mới phải duy nhất (ARE-01).'
                }
                trailing={form.codeLocked ? <Icon name="lock" size={16} className="field__lock" /> : undefined}
                onChange={(e) => form.setField('code', e.target.value)}
              />
              <InputField
                label="Tên khu vực"
                required
                autoComplete="off"
                maxLength={AREA_NAME_MAX_LENGTH}
                value={values.name}
                error={errors.name}
                changed={changed.has('name')}
                hint={changed.has('name') ? `Trước: ${before('name')}` : undefined}
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
                changed={changed.has('type')}
                disabled={submitting}
                onChange={(value) => form.setField('type', value as AreaTypeCode | '')}
              />
              <ParentAreaField
                parent={parent}
                highlighted={changed.has('parentCode')}
                hint={parentHint}
                error={errors.parentCode}
                disabled={submitting}
                onOpen={() => {
                  setTree(areasApi.getTree());
                  setPickerOpen(true);
                }}
                onClear={() => form.setField('parentCode', '')}
              />
            </div>
          </section>

          <hr className="area-card__divider" />

          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Vị trí &amp; thông số kỹ thuật</h2>
              <p>Diện tích và sức chứa thiết kế phải là số dương lớn hơn 0.</p>
            </div>
            <div className="area-form__grid">
              <InputField
                label="Tọa độ GPS"
                autoComplete="off"
                value={values.gps}
                changed={changed.has('gps')}
                hint={changed.has('gps') ? `Trước: ${before('gps')}` : undefined}
                disabled={submitting}
                onChange={(e) => form.setField('gps', e.target.value)}
              />
              <InputField
                label="Diện tích mặt bằng (m²)"
                inputMode="decimal"
                autoComplete="off"
                value={values.areaSize}
                error={errors.areaSize}
                changed={changed.has('areaSize') && !errors.areaSize}
                hint={changed.has('areaSize') ? `Trước: ${initial.areaSize || '—'}` : undefined}
                disabled={submitting}
                onChange={(e) => form.setField('areaSize', e.target.value)}
              />
              <InputField
                label="Sức chứa thiết kế"
                inputMode="decimal"
                autoComplete="off"
                value={values.capacity}
                error={errors.capacity}
                changed={changed.has('capacity') && !errors.capacity}
                hint={changed.has('capacity') ? `Trước: ${initial.capacity || '—'}` : undefined}
                disabled={submitting}
                onChange={(e) => form.setField('capacity', e.target.value)}
              />
              <SelectField
                label="Đơn vị sức chứa"
                placeholder="Chọn đơn vị"
                options={CAPACITY_UNITS}
                value={values.capacityUnit}
                changed={changed.has('capacityUnit')}
                disabled={submitting}
                onChange={(value) => value && form.setField('capacityUnit', value as CapacityUnit)}
              />
            </div>
            <TextAreaField
              label="Mô tả quy chuẩn kỹ thuật"
              value={values.standards}
              changed={changed.has('standards')}
              disabled={submitting}
              onChange={(e) => form.setField('standards', e.target.value)}
            />
          </section>

          <hr className="area-card__divider" />

          <section className="area-form__section">
            <div className="area-card__heading">
              <h2>Lý do cập nhật</h2>
              <p>Bắt buộc – lưu vào nhật ký thay đổi cùng giá trị trước/sau (ARE-11).</p>
            </div>
            <TextAreaField
              label="Lý do cập nhật"
              required
              placeholder="Nhập lý do cập nhật"
              maxLength={500}
              value={form.reason}
              error={form.reasonError}
              disabled={submitting}
              onChange={(e) => form.setReason(e.target.value)}
            />
          </section>
        </form>

        <aside className="area-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin quản lý</h2>
            <p className="side-card__subtitle">Chỉ đọc – do hệ thống quản lý.</p>
            <div className="side-card__item">
              <span className="side-card__label">Mã khu vực</span>
              <span className="side-card__value">
                {original.code} · {form.referenceText ? 'đã khóa' : 'được phép sửa'}
              </span>
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Trạng thái</span>
              <StatusBadge label={badge.label} tone={badge.tone} />
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Phiên bản đang sửa</span>
              <span className="side-card__value">
                Phiên bản {original.version} · {formatDateTime(versionEntry.at)} · {versionEntry.by}
              </span>
            </div>
            <div className="side-card__item">
              <span className="side-card__label">Tham chiếu đã phát sinh</span>
              <span className="side-card__value">{form.referenceText ?? 'Chưa có tham chiếu'}</span>
            </div>
          </section>

          <section className="side-card">
            <h2 className="side-card__title">Không thay đổi tại đây</h2>
            <ul className="side-card__notes">
              {OUT_OF_SCOPE_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          {changes.length > 0 && (
            <section className="side-card">
              <h2 className="side-card__title">Thay đổi chưa lưu ({changes.length})</h2>
              <ul className="unsaved-changes">
                {changes.map((change) => (
                  <li key={change.field}>
                    <span className="side-card__label">{AREA_FIELD_LABELS[change.field]}</span>
                    <span className="unsaved-changes__diff">
                      <del>{change.before}</del>
                      <Icon name="arrow-right" size={14} />
                      <strong>{change.after}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {pickerOpen && (
        <ParentAreaPicker
          areas={tree}
          target={{ kind: 'existing', area: original }}
          initialParentCode={values.parentCode !== original.parentCode ? values.parentCode : undefined}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(picked) => {
            form.setField('parentCode', picked.code);
            setPickerOpen(false);
          }}
        />
      )}

      {conflictOpen && form.alert?.kind === 'conflict' && (
        <ConflictDialog
          conflict={form.alert.conflict}
          mine={diffAreaDraft(initial, values)}
          original={original}
          onClose={() => setConflictOpen(false)}
          onReload={(latest) => {
            setConflictOpen(false);
            form.reloadLatest(latest);
          }}
        />
      )}

      {leaveTarget && (
        <Dialog
          title="Hủy chỉnh sửa khu vực?"
          width={480}
          initialFocus="first"
          onClose={() => setLeaveTarget(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setLeaveTarget(null)}>
                Tiếp tục chỉnh sửa
              </Button>
              <Button variant="danger" onClick={() => navigate(leaveTarget)}>
                Hủy chỉnh sửa
              </Button>
            </>
          }
        >
          <p className="dialog__body">
            {changes.length > 0 ? `Có ${changes.length} thay đổi chưa lưu.` : 'Lý do cập nhật đã nhập chưa được lưu.'} Nếu hủy, hệ
            thống không lưu thay đổi và{' '}
            {leaveTarget === ROUTES.areaDetail(original.code) ? 'quay lại màn hình chi tiết với dữ liệu ban đầu.' : 'mở hồ sơ khu vực đã chọn.'}
          </p>
        </Dialog>
      )}
    </>
  );
}

type AlertBannerProps = {
  alert: EditAreaAlert;
  originalCode: string;
  onOpenArea: (code: string) => void;
  onShowConflict: () => void;
};

/** Banner phía trên biểu mẫu cho các frame 04.2, 04.3, 04.4, 04.5. */
function EditAreaAlertBanner({ alert, originalCode, onOpenArea, onShowConflict }: AlertBannerProps) {
  switch (alert.kind) {
    case 'invalid': {
      const parts = [
        alert.numberInvalid && 'Diện tích và sức chứa thiết kế phải là số dương lớn hơn 0.',
        alert.reasonMissing && 'Vui lòng nhập lý do cập nhật.',
      ].filter(Boolean);
      return (
        <Alert tone="danger" title={`Chưa thể lưu thay đổi – ${alert.count} trường cần kiểm tra`}>
          {parts.length > 0 ? parts.join(' ') : 'Vui lòng điền đầy đủ các thông tin bắt buộc.'}
        </Alert>
      );
    }
    case 'duplicate-name': {
      const owner = alert.parent ? `${alert.parent.name} (${alert.parent.code}) đã có khu vực` : 'Cấp 1 đã có khu vực';
      return (
        <Alert
          tone="warning"
          title="Tên khu vực đã tồn tại trong cùng khu vực trực thuộc"
          action={
            <button type="button" className="alert__link" onClick={() => onOpenArea(alert.existing.code)}>
              Xem {alert.existing.name} ({alert.existing.code})
            </button>
          }
        >
          {owner} "{alert.existing.name}". Vui lòng đặt tên khác.
        </Alert>
      );
    }
    case 'code-locked':
      return (
        <Alert tone="danger" title="Mã khu vực đã phát sinh dữ liệu giao dịch kinh doanh, không được phép thay đổi.">
          Yêu cầu đổi mã {originalCode} → {alert.code} bị từ chối ({describeReferences(alert.references)}). Chưa có thay đổi nào được
          lưu; hãy giữ nguyên mã và lưu lại các thay đổi khác.
        </Alert>
      );
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
          Mã {alert.code} đang được dùng (ARE-01). Nhập mã khác hoặc giữ mã {originalCode}.
        </Alert>
      );
    case 'invalid-parent':
      return (
        <Alert tone="danger" title="Khu vực cấp cha không hợp lệ">
          Sơ đồ phân cấp đã thay đổi hoặc vi phạm giới hạn 3 cấp. Vui lòng mở lại "Khu vực cấp cha" và chọn lại.
        </Alert>
      );
    case 'conflict':
      return (
        <Alert
          tone="warning"
          title="Dữ liệu khu vực đã được cập nhật bởi người khác"
          action={
            <button type="button" className="alert__link" onClick={onShowConflict}>
              Xem đối chiếu và tải lại trang
            </button>
          }
        >
          Vui lòng tải lại trang để xem thông tin mới nhất trước khi chỉnh sửa.
        </Alert>
      );
    case 'no-changes':
      return (
        <Alert tone="info" title="Chưa có thay đổi nào để lưu">
          Thông tin trên biểu mẫu trùng với phiên bản đang lưu; hệ thống không tạo phiên bản và nhật ký mới.
        </Alert>
      );
    case 'forbidden':
      return (
        <Alert tone="danger" title="Không còn quyền cập nhật khu vực">
          Quyền của tài khoản đã thay đổi nên thay đổi chưa được lưu. Liên hệ Quản trị hệ thống nếu cần tiếp tục.
        </Alert>
      );
    case 'save-failed':
      return (
        <Alert tone="danger" title="Không lưu được thay đổi">
          Hệ thống chưa ghi được phiên bản mới. Dữ liệu trên biểu mẫu được giữ nguyên, vui lòng thử lại sau.
        </Alert>
      );
  }
}

type ConflictDialogProps = {
  conflict: AreaConflict;
  mine: ReturnType<typeof diffAreaDraft>;
  original: Area;
  onClose: () => void;
  onReload: (latest: Area) => void;
};

/** 04.5 · Đối chiếu thay đổi của mình (nền accent-soft) với bản mới của người khác (nền warning-soft). */
function ConflictDialog({ conflict, mine, original, onClose, onReload }: ConflictDialogProps) {
  const theirs = diffAreaDraft(toAreaDraft(original), toAreaDraft(conflict.latest));
  const fields = (Object.keys(AREA_FIELD_LABELS) as AreaField[]).filter((f) => [...mine, ...theirs].some((c) => c.field === f));
  const latestDraft = toAreaDraft(conflict.latest);

  return (
    <Dialog
      title={`Đối chiếu phiên bản khu vực ${original.code}`}
      width={760}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={() => onReload(conflict.latest)}>Tải lại trang</Button>
        </>
      }
    >
      <p className="dialog__body">
        {conflict.updatedBy} đã lưu phiên bản {conflict.latest.version} lúc {formatDateTime(conflict.updatedAt)} trong khi bạn đang sửa
        phiên bản {original.version}. Thay đổi của bạn chưa được lưu.
      </p>
      <div className="path-table__wrap">
        <table className="path-table conflict-compare">
          <thead>
            <tr>
              <th scope="col">Trường</th>
              <th scope="col">Thay đổi của bạn (chưa lưu)</th>
              <th scope="col">Bản mới nhất – {conflict.updatedBy}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const my = mine.find((c) => c.field === field);
              const their = theirs.find((c) => c.field === field);
              const current = latestDraft[field];
              return (
                <tr key={field}>
                  <th scope="row">{AREA_FIELD_LABELS[field]}</th>
                  <td className="conflict-compare__mine">{my ? my.after : '(không đổi)'}</td>
                  <td className="conflict-compare__theirs">
                    {their ? their.after : current && current.length <= 30 ? `${current} (không đổi)` : '(không đổi)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="area-picker__rule">
        Sau khi tải lại, hệ thống hiển thị phiên bản {conflict.latest.version}; bạn nhập lại các thay đổi còn cần thiết.
      </p>
    </Dialog>
  );
}
