import { useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { areasApi } from '../api/areasApi';
import { ChangeAreaParentError, type Area, type AreaPathChange, type ChangeAreaParentResult } from '../types/area';
import { asLevel, descendantsOf, levelUnder, PARENT_REJECTION_TEXT, pathUnder } from '../utils/areaHierarchy';
import { ParentAreaPicker } from './ParentAreaPicker';
import { PathChangeTable } from './PathChangeTable';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Đường dẫn trước → sau của khu vực và các phân khu con nếu chuyển sang khu vực cha mới (xem trước bước 7–8). */
function previewChanges(areas: Area[], area: Area, parent: Area): AreaPathChange[] {
  const level = asLevel(levelUnder(parent));
  const path = pathUnder(parent, area.code);
  return [
    { code: area.code, name: area.name, levelBefore: area.level, level, pathBefore: area.path, path },
    ...descendantsOf(areas, area.code).map((child) => ({
      code: child.code,
      name: child.name,
      levelBefore: child.level,
      level: asLevel(child.level + level - area.level),
      pathBefore: child.path,
      path: path + child.path.slice(area.path.length),
    })),
  ];
}

type ChangeParentFlowProps = {
  area: Area;
  onClose: () => void;
  onChanged: (result: ChangeAreaParentResult) => void;
};

/**
 * UC-ARE-02 trong ngữ cảnh chỉnh sửa khu vực: chọn khu vực cấp cha mới trên sơ đồ (02.5 / 02.6), xem lại đường dẫn của
 * khu vực và các phân khu con, rồi "Lưu thay đổi" để ghi cấu trúc phân cấp (bước 9 → 02.7).
 */
export function ChangeParentFlow({ area, onClose, onChanged }: ChangeParentFlowProps) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const [tree] = useState<Area[]>(() => areasApi.getTree());
  const [parent, setParent] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());

  if (!parent) {
    return <ParentAreaPicker areas={tree} target={{ kind: 'existing', area }} onCancel={onClose} onConfirm={setParent} />;
  }

  const changes = previewChanges(tree, area, parent);
  const currentParent = area.parentCode ? tree.find((a) => a.code === area.parentCode) : undefined;

  async function save() {
    if (!user || saving || !parent) return;
    setSaving(true);
    setError(null);
    try {
      const result = await areasApi.changeParent({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        code: area.code,
        baseVersion: area.version,
        parentCode: parent.code,
      });
      onChanged(result);
    } catch (caught) {
      setSaving(false);
      if (!(caught instanceof ChangeAreaParentError)) {
        setError({ title: 'Không lưu được thay đổi', body: 'Kết nối bị gián đoạn. Cấu trúc phân cấp giữ nguyên, vui lòng thử lại.' });
        return;
      }
      switch (caught.code) {
        case 'SESSION_ENDED':
          endSession(caught.sessionStatus ?? 'expired');
          return;
        case 'INVALID_PARENT':
          setError(PARENT_REJECTION_TEXT[caught.parentRejection ?? 'NOT_FOUND']);
          return;
        case 'DUPLICATE_NAME':
          setError({
            title: 'Tên khu vực đã tồn tại trong cùng khu vực trực thuộc',
            body: `${parent.name} đã có khu vực "${caught.existing?.name}" (${caught.existing?.code}). Đổi tên khu vực trước hoặc chọn khu vực cấp cha khác.`,
          });
          return;
        case 'CONFLICT':
          setError({
            title: 'Dữ liệu khu vực đã được cập nhật bởi người khác',
            body: 'Vui lòng tải lại trang để xem bản mới nhất trước khi điều chỉnh khu vực cấp cha.',
          });
          return;
        case 'FORBIDDEN':
          setError({ title: 'Không còn quyền điều chỉnh khu vực', body: 'Quyền của tài khoản đã thay đổi nên thay đổi chưa được lưu.' });
          return;
        default:
          setError({ title: 'Không lưu được thay đổi', body: 'Hệ thống chưa ghi được cấu trúc phân cấp. Liên kết cũ được giữ nguyên, vui lòng thử lại sau.' });
      }
    }
  }

  return (
    <Dialog
      title="Lưu thay đổi cấu trúc phân cấp?"
      width={720}
      initialFocus="first"
      onClose={() => !saving && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={saving} onClick={() => setParent(null)}>
            Chọn lại khu vực cha
          </Button>
          <Button disabled={saving} className={saving ? 'is-busy' : undefined} onClick={() => void save()}>
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        {area.name} sẽ chuyển từ {currentParent ? `${currentParent.name} (${currentParent.code})` : 'Cấp 1 độc lập'} sang{' '}
        <strong>
          {parent.name} ({parent.code})
        </strong>
        . Mã khu vực không đổi; đường dẫn của {changes.length - 1} phân khu con trực thuộc được đồng bộ lại.
      </p>
      {parent.status === 'suspended' && (
        <Alert tone="warning" title="Khu vực cấp cha đang tạm ngưng hoạt động">
          Khu vực này và các phân khu con sẽ chịu ràng buộc hạn chế giao dịch theo khu vực cha.
        </Alert>
      )}
      {error && (
        <Alert tone="danger" title={error.title}>
          {error.body}
        </Alert>
      )}
      <PathChangeTable changes={changes} />
    </Dialog>
  );
}
