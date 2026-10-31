import { useMemo, useState } from 'react';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import type { Area } from '../types/area';
import { areaIcon, areaTypeLabel } from '../utils/areaFormat';
import {
  ancestryOf,
  checkParentCandidate,
  childrenOf,
  describeCycle,
  descendantsOf,
  MAX_AREA_LEVEL,
  PARENT_REJECTION_TEXT,
  PENDING_AREA_CODE,
  type ParentCheck,
} from '../utils/areaHierarchy';
import { normalizeAreaSearch } from '../utils/areaValidation';
import { LevelBadge } from './HierarchyChain';

type PickerTarget =
  /** UC-ARE-01: khu vực mới chưa lưu, chỉ có tên/mã đang nhập. */
  | { kind: 'new'; name: string; code: string }
  /** UC-ARE-04: khu vực đã có, cần chặn vòng lặp và giữ phân khu con trong giới hạn 3 cấp. */
  | { kind: 'existing'; area: Area };

type ParentAreaPickerProps = {
  /** Sơ đồ phân cấp hiện hành, đã sắp theo thứ tự phân cấp. */
  areas: Area[];
  target: PickerTarget;
  initialParentCode?: string;
  onCancel: () => void;
  onConfirm: (parent: Area) => void;
};

/**
 * UC-ARE-02 · Hộp thoại "Chọn khu vực cấp cha" (02.1, 02.4, 02.5, 02.6): duyệt cây sơ đồ phân cấp hoặc tìm theo mã/tên,
 * kiểm tra giới hạn 3 cấp (ARE-03), chống vòng lặp, cảnh báo khu vực cha Tạm ngưng và xem trước cấp & đường dẫn.
 */
export function ParentAreaPicker({ areas, target, initialParentCode, onCancel, onConfirm }: ParentAreaPickerProps) {
  const editingCode = target.kind === 'existing' ? target.area.code : undefined;
  const [selected, setSelected] = useState<string | null>(initialParentCode || null);
  const [keyword, setKeyword] = useState('');
  // Mở sẵn nhánh chứa khu vực cha đang chọn / khu vực đang sửa; không có thì mở khu vực Cấp 1 đầu tiên.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const focus = initialParentCode || editingCode;
    const open = focus ? ancestryOf(areas, focus).map((a) => a.code) : areas.filter((a) => a.level === 1).slice(0, 1).map((a) => a.code);
    return new Set(open);
  });

  const selectedArea = selected ? areas.find((a) => a.code === selected) : undefined;
  const check: ParentCheck | null = selected ? checkParentCandidate(areas, selected, editingCode) : null;
  const ownCode = target.kind === 'existing' ? target.area.code : target.code.trim().toUpperCase() || PENDING_AREA_CODE;
  const ownName = target.kind === 'existing' ? target.area.name : target.name.trim() || 'khu vực mới';

  const search = normalizeAreaSearch(keyword);
  const visible = useMemo(() => {
    if (!search) return null;
    // Khớp mã/tên cùng toàn bộ khu vực cha của nó để giữ ngữ cảnh trên cây.
    const shown = new Set<string>();
    for (const area of areas) {
      if (normalizeAreaSearch(area.name).includes(search) || area.code.toLowerCase().includes(search)) {
        ancestryOf(areas, area.code).forEach((a) => shown.add(a.code));
      }
    }
    return shown;
  }, [areas, search]);

  const rows = useMemo(() => {
    const result: Area[] = [];
    const visit = (parentCode: string | null) => {
      for (const area of childrenOf(areas, parentCode)) {
        if (visible && !visible.has(area.code)) continue;
        result.push(area);
        if (visible || expanded.has(area.code)) visit(area.code);
      }
    };
    visit(null);
    return result;
  }, [areas, expanded, visible]);

  function toggle(code: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const subtitle =
    target.kind === 'new'
      ? `Đang thiết lập cho: ${ownName} (khu vực mới, chưa lưu)`
      : describeExisting(areas, target.area);

  // Nút xác nhận mờ 40% cho tới khi chọn được khu vực hợp lệ (02.4 / 02.5).
  const blocked = !check || !check.ok;
  const suspendedParent = check?.ok === true && check.suspended;

  return (
    <Dialog
      title="Chọn khu vực cấp cha"
      width={656}
      initialFocus="first"
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Hủy
          </Button>
          <Button disabled={blocked} className={blocked ? 'area-picker__confirm--blocked' : undefined} onClick={() => selectedArea && onConfirm(selectedArea)}>
            {suspendedParent ? 'Vẫn chọn khu vực này' : 'Chọn khu vực này'}
          </Button>
        </>
      }
    >
      <p className="area-picker__subtitle">{subtitle}</p>

      <label className="area-picker__search">
        <Icon name="search" />
        <span className="visually-hidden">Tìm khu vực</span>
        <input
          type="search"
          value={keyword}
          placeholder="Tìm theo mã hoặc tên khu vực…"
          onChange={(e) => setKeyword(e.target.value)}
        />
      </label>

      <p className="area-picker__rule">
        <Icon name="info" size={16} />
        Chỉ chọn được khu vực Cấp 1 hoặc Cấp 2 để khu vực con không vượt quá Cấp {MAX_AREA_LEVEL} (ARE-03).
      </p>

      {check && !check.ok && (
        <Alert tone={check.reason === 'CURRENT_PARENT' ? 'info' : 'danger'} title={PARENT_REJECTION_TEXT[check.reason].title}>
          {PARENT_REJECTION_TEXT[check.reason].body}
        </Alert>
      )}
      {suspendedParent && (
        <Alert tone="warning" title="Khu vực cấp cha đang tạm ngưng hoạt động">
          {target.kind === 'new'
            ? 'Phân khu mới tạo sẽ chịu ràng buộc hạn chế giao dịch theo khu vực cha.'
            : 'Khu vực này và các phân khu con sẽ chịu ràng buộc hạn chế giao dịch theo khu vực cha.'}
        </Alert>
      )}

      <ul className="area-tree" role="tree" aria-label="Sơ đồ phân cấp mặt bằng cảng">
        {rows.length === 0 && <li className="area-tree__empty">Không tìm thấy khu vực khớp "{keyword.trim()}".</li>}
        {rows.map((area) => {
          const hasChildren = childrenOf(areas, area.code).length > 0;
          const open = Boolean(visible) || expanded.has(area.code);
          const isSelected = area.code === selected;
          const rowCheck = isSelected ? check : null;
          const tone = !rowCheck ? '' : !rowCheck.ok ? (rowCheck.reason === 'CURRENT_PARENT' ? 'info' : 'danger') : rowCheck.suspended ? 'warning' : 'ok';
          const className = ['area-tree__row', tone && `area-tree__row--${tone}`].filter(Boolean).join(' ');
          return (
            <li
              key={area.code}
              role="treeitem"
              aria-level={area.level}
              aria-selected={isSelected}
              aria-expanded={hasChildren ? open : undefined}
              className={className}
              style={{ paddingLeft: 12 + (area.level - 1) * 24 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className={open ? 'area-tree__toggle area-tree__toggle--open' : 'area-tree__toggle'}
                  aria-label={open ? `Thu gọn ${area.name}` : `Mở rộng ${area.name}`}
                  disabled={Boolean(visible)}
                  onClick={() => toggle(area.code)}
                >
                  <Icon name="chevron" size={16} />
                </button>
              ) : (
                <span className="area-tree__toggle-space" aria-hidden />
              )}
              <button type="button" className="area-tree__select" onClick={() => setSelected(area.code)}>
                <Icon name={areaIcon(area)} className="area-tree__icon" />
                <span className="area-tree__text">
                  <span className="area-tree__name">{area.name}</span>
                  <span className="area-tree__meta">
                    {area.code} · {areaTypeLabel(area.type)}
                  </span>
                </span>
              </button>
              <span className="area-tree__tags">
                {rowCheck && !rowCheck.ok && <span className="area-tree__reason">{PARENT_REJECTION_TEXT[rowCheck.reason].tag}</span>}
                {area.code === editingCode && <span className="area-tag area-tag--info">Đang chỉnh sửa</span>}
                {area.status === 'suspended' && <span className="area-tag area-tag--warning">Tạm ngưng</span>}
                <LevelBadge level={area.level} />
                {rowCheck && (
                  <Icon
                    name={rowCheck.ok ? 'check' : rowCheck.reason === 'CURRENT_PARENT' ? 'info' : 'x'}
                    className="area-tree__state"
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <PreviewBox areas={areas} parent={selectedArea} check={check} ownCode={ownCode} editingCode={editingCode} />
    </Dialog>
  );
}

function describeExisting(areas: Area[], area: Area): string {
  const parent = area.parentCode ? areas.find((a) => a.code === area.parentCode) : undefined;
  const childCount = childrenOf(areas, area.code).length;
  const where = parent ? `hiện thuộc ${parent.name}` : 'hiện là khu vực Cấp 1';
  return `Đang điều chỉnh: ${area.name} (${area.code}) – ${where}, có ${childCount} phân khu con.`;
}

type PreviewBoxProps = {
  areas: Area[];
  parent?: Area;
  check: ParentCheck | null;
  ownCode: string;
  editingCode?: string;
};

/** Cấp & đường dẫn phân cấp của khu vực nếu chọn khu vực cha đang trỏ (02.1 / 02.4 / 02.5). */
function PreviewBox({ areas, parent, check, ownCode, editingCode }: PreviewBoxProps) {
  let level = 'Chưa chọn khu vực cấp cha';
  let path = '—';
  let tone = '';

  if (parent && check) {
    path = `${parent.path}/${ownCode}`;
    if (check.ok) {
      level = `Cấp ${check.level} (= Cấp ${parent.level} + 1)`;
    } else {
      tone = 'danger';
      switch (check.reason) {
        case 'MAX_LEVEL':
          level = `Cấp ${check.level} – vượt giới hạn`;
          path = `${path}/…`;
          break;
        case 'SUBTREE_TOO_DEEP': {
          const deepest = Math.max(...descendantsOf(areas, editingCode!).map((d) => d.level));
          level = `Cấp ${check.level} – phân khu con sẽ ở Cấp ${deepest + check.level - areas.find((a) => a.code === editingCode)!.level}`;
          break;
        }
        case 'SELF':
        case 'DESCENDANT':
          level = 'Vòng lặp phân cấp';
          path = describeCycle(parent, editingCode!);
          break;
        case 'CURRENT_PARENT':
          tone = '';
          level = 'Không thay đổi';
          break;
        case 'NOT_FOUND':
          level = 'Không xác định';
          path = '—';
      }
    }
  }

  return (
    <div className={tone ? `area-preview area-preview--${tone}` : 'area-preview'}>
      <div>
        <span className="area-preview__label">Cấp của khu vực sau khi chọn</span>
        <span className="area-preview__value">{level}</span>
      </div>
      <div>
        <span className="area-preview__label">Đường dẫn phân cấp (HierarchyPath)</span>
        <span className="area-preview__value">{path}</span>
      </div>
    </div>
  );
}
