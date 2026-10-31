import { useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { todayIso } from '@/utils/format';
import { areasApi } from '../api/areasApi';
import { AreaOperationError, type Area, type AreaService, type AreaStaff } from '../types/area';

export const SHIFTS = ['Ca 1 · 06:00 – 14:00', 'Ca 2 · 14:00 – 22:00', 'Ca 3 · 22:00 – 06:00', 'Hành chính · 08:00 – 17:00'];

const ERROR_TEXT: Record<AreaOperationError['code'], string> = {
  SESSION_ENDED: 'Phiên đăng nhập đã kết thúc.',
  VALIDATION: 'Thông tin chưa hợp lệ, vui lòng kiểm tra lại các trường bắt buộc.',
  ALREADY_ASSIGNED: 'Nhân viên này đang phụ trách khu vực. Chọn nhân viên khác hoặc kết thúc phân công hiện tại trước.',
  NO_CHANGES: 'Danh mục dịch vụ không thay đổi so với hiện tại.',
  SAME_STATUS: 'Khu vực đã ở trạng thái này. Tải lại trang để xem thông tin mới nhất.',
  CONFLICT: 'Hồ sơ khu vực vừa được người khác cập nhật. Tải lại trang trước khi đổi trạng thái.',
  NOT_FOUND: 'Khu vực hoặc phân công không còn tồn tại.',
  FORBIDDEN: 'Tài khoản không còn quyền thực hiện thao tác này (chỉ Trưởng phòng Khai thác).',
};

/** Gửi một thao tác, quy lỗi server về thông báo hiển thị trong hộp thoại; phiên hết hạn thì đăng xuất. */
function useOperation() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(operation: (identity: { userId: string; signedInAt: string }) => Promise<unknown>): Promise<boolean> {
    if (!user || busy) return false;
    setBusy(true);
    setError(null);
    try {
      await operation({ userId: user.id, signedInAt: user.signedInAt });
      return true;
    } catch (caught) {
      if (caught instanceof AreaOperationError && caught.code === 'SESSION_ENDED') endSession(caught.sessionStatus ?? 'expired');
      else setError(caught instanceof AreaOperationError ? ERROR_TEXT[caught.code] : 'Kết nối bị gián đoạn, thay đổi chưa được lưu. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

/* ---------- Phân công nhân sự (13.4) ---------- */

type StaffAssignDialogProps = { area: Area; current: AreaStaff[]; onClose: () => void; onDone: (person: AreaStaff) => void };

export function StaffAssignDialog({ area, current, onClose, onDone }: StaffAssignDialogProps) {
  const catalog = useMemo(() => areasApi.getOperationCatalogs().staff, []);
  const available = catalog.filter((s) => !current.some((c) => c.staffCode === s.staffCode));
  const [staffCode, setStaffCode] = useState('');
  const [title, setTitle] = useState('');
  const [shift, setShift] = useState('');
  const [since, setSince] = useState(todayIso());
  const [attempted, setAttempted] = useState(false);
  const { busy, error, run } = useOperation();

  const errors = attempted
    ? {
        staff: staffCode ? undefined : 'Vui lòng chọn nhân viên.',
        title: title.trim() ? undefined : 'Vui lòng nhập chức danh tại khu vực.',
        shift: shift ? undefined : 'Vui lòng chọn ca trực.',
        since: since ? undefined : 'Vui lòng chọn ngày bắt đầu phụ trách.',
      }
    : {};

  async function save() {
    setAttempted(true);
    if (!staffCode || !title.trim() || !shift || !since) return;
    let assigned: AreaStaff | null = null;
    const ok = await run(async (id) => {
      assigned = await areasApi.assignStaff({ ...id, code: area.code, staffCode, title, shift, since });
    });
    if (ok && assigned) onDone(assigned);
  }

  return (
    <Dialog
      title="Phân công nhân sự phụ trách"
      width={560}
      initialFocus="first"
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy} className={busy ? 'is-busy' : undefined} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : 'Phân công'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        Giao cán bộ Khai thác phụ trách {area.name} ({area.code}) theo ca trực. Thao tác được ghi vào lịch sử biến động của khu vực.
      </p>
      {error && <Alert tone="danger" title="Chưa phân công được">{error}</Alert>}
      <div className="operation-form">
        <SelectField
          label="Nhân viên Khai thác"
          required
          placeholder={available.length ? 'Chọn nhân viên' : 'Mọi nhân viên đã được phân công'}
          options={available.map((s) => ({ value: s.staffCode, label: `${s.name} · ${s.staffCode}` }))}
          value={staffCode}
          error={errors.staff}
          disabled={busy || available.length === 0}
          onChange={(value) => {
            setStaffCode(value);
            const picked = catalog.find((s) => s.staffCode === value);
            if (picked && !title.trim()) setTitle(picked.defaultTitle);
          }}
        />
        <InputField label="Chức danh tại khu vực" required value={title} error={errors.title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
        <SelectField
          label="Ca trực"
          required
          placeholder="Chọn ca trực"
          options={SHIFTS.map((s) => ({ value: s, label: s }))}
          value={shift}
          error={errors.shift}
          disabled={busy}
          onChange={setShift}
        />
        <InputField label="Phụ trách từ ngày" required type="date" value={since} error={errors.since} disabled={busy} onChange={(e) => setSince(e.target.value)} />
      </div>
    </Dialog>
  );
}

/* ---------- Kết thúc phân công ---------- */

type EndStaffDialogProps = { area: Area; person: AreaStaff; onClose: () => void; onDone: () => void };

export function EndStaffDialog({ area, person, onClose, onDone }: EndStaffDialogProps) {
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const { busy, error, run } = useOperation();

  async function save() {
    setAttempted(true);
    if (!reason.trim()) return;
    if (await run((id) => areasApi.endStaff({ ...id, code: area.code, staffCode: person.staffCode, reason }))) onDone();
  }

  return (
    <Dialog
      title="Kết thúc phân công?"
      width={500}
      initialFocus="first"
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Giữ phân công
          </Button>
          <Button variant="danger" disabled={busy} className={busy ? 'is-busy' : undefined} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : 'Kết thúc phân công'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        {person.name} ({person.staffCode}) sẽ thôi phụ trách {area.name} – {person.shift}. Lý do được ghi vào lịch sử biến động.
      </p>
      {error && <Alert tone="danger" title="Chưa kết thúc được phân công">{error}</Alert>}
      <TextAreaField
        label="Lý do"
        required
        placeholder="VD: Điều chuyển sang Cảng Hiệp Phước từ 01/11/2026"
        value={reason}
        error={attempted && !reason.trim() ? 'Vui lòng nhập lý do kết thúc phân công.' : undefined}
        disabled={busy}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}

/* ---------- Gán dịch vụ (13.3) ---------- */

type ServicesDialogProps = { area: Area; current: AreaService[]; onClose: () => void; onDone: (summary: string) => void };

export function ServicesDialog({ area, current, onClose, onDone }: ServicesDialogProps) {
  const catalog = useMemo(() => areasApi.getOperationCatalogs().services, []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current.map((s) => s.name)));
  const [since, setSince] = useState(todayIso());
  const [reason, setReason] = useState('');
  const { busy, error, run } = useOperation();

  const added = [...selected].filter((n) => !current.some((s) => s.name === n));
  const removed = current.filter((s) => !selected.has(s.name));
  const groups = [...new Set(catalog.map((s) => s.group))];

  function toggle(name: string) {
    setSelected((value) => {
      const next = new Set(value);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function save() {
    const summary = [added.length && `thêm ${added.length}`, removed.length && `gỡ ${removed.length}`].filter(Boolean).join(', ');
    if (await run((id) => areasApi.setServices({ ...id, code: area.code, serviceNames: [...selected], since, reason }))) onDone(summary);
  }

  return (
    <Dialog
      title="Gán dịch vụ khai thác"
      width={620}
      initialFocus="first"
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || (added.length === 0 && removed.length === 0)} className={busy ? 'is-busy' : undefined} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : 'Lưu danh mục dịch vụ'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        Chọn dịch vụ được phép cung cấp tại {area.name} ({area.code}). Chỉ dịch vụ trong danh mục này mới được chọn khi lập bảng giá,
        hợp đồng, ghi nhận sản lượng tại khu vực.
      </p>
      {error && <Alert tone="danger" title="Chưa lưu được danh mục dịch vụ">{error}</Alert>}
      {removed.length > 0 && (
        <Alert tone="warning" title={`Gỡ ${removed.length} dịch vụ khỏi khu vực`}>
          Bảng giá, hợp đồng đã phát sinh với dịch vụ bị gỡ giữ nguyên; chỉ chặn chọn dịch vụ này cho giao dịch mới.
        </Alert>
      )}
      <div className="operation-services">
        {groups.map((group) => (
          <div key={group} className="operation-services__group" role="group" aria-label={group}>
            <span className="operation-services__title">{group}</span>
            {catalog
              .filter((s) => s.group === group)
              .map((service) => {
                const on = selected.has(service.name);
                return (
                  <label key={service.name} className="export-sections__item">
                    <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(service.name)} />
                    <span className={on ? 'export-sections__box export-sections__box--on' : 'export-sections__box'} aria-hidden>
                      {on && <Icon name="check" size={14} />}
                    </span>
                    <span className="operation-services__name">
                      {service.name}
                      <small>{service.unit}</small>
                    </span>
                  </label>
                );
              })}
          </div>
        ))}
      </div>
      <div className="operation-form">
        <InputField
          label="Áp dụng từ ngày (dịch vụ thêm mới)"
          type="date"
          value={since}
          disabled={busy || added.length === 0}
          onChange={(e) => setSince(e.target.value)}
        />
        <InputField label="Ghi chú" placeholder="VD: Bổ sung theo đề xuất của Phòng Kinh doanh" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Dialog>
  );
}

/* ---------- Tạm ngưng / mở lại khu vực ---------- */

type StatusDialogProps = {
  area: Area;
  parent: Area | null;
  childCount: number;
  /** Số hợp đồng đang khai thác tại khu vực; null khi chưa tải được. */
  activeContracts: number | null;
  onClose: () => void;
  onDone: (area: Area) => void;
};

export function StatusDialog({ area, parent, childCount, activeContracts, onClose, onDone }: StatusDialogProps) {
  const suspending = area.status === 'active';
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const { busy, error, run } = useOperation();

  async function save() {
    setAttempted(true);
    if (!reason.trim()) return;
    let next: Area | null = null;
    const ok = await run(async (id) => {
      next = await areasApi.changeStatus({ ...id, code: area.code, baseVersion: area.version, status: suspending ? 'suspended' : 'active', reason });
    });
    if (ok && next) onDone(next);
  }

  return (
    <Dialog
      title={suspending ? 'Tạm ngưng khu vực?' : 'Mở lại hoạt động khu vực?'}
      icon={suspending ? 'pause' : 'play'}
      tone={suspending ? 'danger' : 'info'}
      width={540}
      initialFocus="first"
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button variant={suspending ? 'danger' : 'primary'} disabled={busy} className={busy ? 'is-busy' : undefined} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : suspending ? 'Tạm ngưng khu vực' : 'Mở lại hoạt động'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        {area.name} ({area.code}) sẽ chuyển {suspending ? 'Hoạt động → Tạm ngưng' : 'Tạm ngưng → Hoạt động'}. Hệ thống tăng phiên bản hồ
        sơ và ghi nhật ký người thực hiện, thời điểm, lý do.
      </p>
      {suspending ? (
        <ul className="side-card__notes operation-impact">
          <li>Không lập mới bảng giá, hợp đồng, phiếu sản lượng tại khu vực trong thời gian tạm ngưng.</li>
          <li>
            {activeContracts === null
              ? 'Hợp đồng đang khai thác tại khu vực vẫn giữ hiệu lực, không bị chấm dứt.'
              : `${activeContracts} hợp đồng đang khai thác vẫn giữ hiệu lực, không bị chấm dứt.`}
          </li>
          {childCount > 0 && <li>{childCount} phân khu con trực thuộc chịu hạn chế giao dịch theo khu vực cha.</li>}
        </ul>
      ) : (
        parent?.status === 'suspended' && (
          <Alert tone="warning" title="Khu vực cấp cha đang tạm ngưng">
            {parent.name} ({parent.code}) vẫn Tạm ngưng nên khu vực này tiếp tục chịu hạn chế giao dịch theo khu vực cha.
          </Alert>
        )
      )}
      {error && <Alert tone="danger" title="Chưa đổi được trạng thái">{error}</Alert>}
      <TextAreaField
        label={suspending ? 'Lý do tạm ngưng' : 'Lý do mở lại'}
        required
        placeholder={suspending ? 'VD: Duy tu nền bãi khu A (15/06 – 30/06/2026)' : 'VD: Hoàn tất duy tu nền bãi khu A'}
        value={reason}
        error={attempted && !reason.trim() ? 'Vui lòng nhập lý do.' : undefined}
        disabled={busy}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}
