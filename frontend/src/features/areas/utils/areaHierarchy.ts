import type { Area, AreaLevel, AreaRef, ParentRejection } from '../types/area';

/** Quy hoạch mặt bằng tối đa 3 cấp logic: Cảng/ICD → Bãi/Kho/Cầu bến → Phân khu/Block (ARE-03). */
export const MAX_AREA_LEVEL = 3;

/** Mã hiển thị trong đường dẫn khi người dùng để trống mã (hệ thống cấp khi lưu – A4). */
export const PENDING_AREA_CODE = 'KV-XXXXXX';

export function childrenOf(areas: Area[], code: string | null): Area[] {
  return areas.filter((a) => a.parentCode === code);
}

/** Mọi phân khu con trực thuộc (mọi cấp) của một khu vực. */
export function descendantsOf(areas: Area[], code: string): Area[] {
  const result: Area[] = [];
  const queue = [code];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf(areas, current)) {
      result.push(child);
      queue.push(child.code);
    }
  }
  return result;
}

/** Số cấp bên dưới khu vực (0 khi không có phân khu con). */
export function subtreeDepth(areas: Area[], code: string): number {
  const children = childrenOf(areas, code);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((c) => subtreeDepth(areas, c.code)));
}

/** Chuỗi khu vực từ Cấp 1 tới khu vực đang xét (gồm chính nó). */
export function ancestryOf(areas: Area[], code: string): Area[] {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const chain: Area[] = [];
  let current = byCode.get(code);
  while (current) {
    chain.unshift(current);
    current = current.parentCode ? byCode.get(current.parentCode) : undefined;
  }
  return chain;
}

export function levelUnder(parent: Pick<Area, 'level'> | null): number {
  return parent ? parent.level + 1 : 1;
}

export function pathUnder(parent: Pick<Area, 'path'> | null, code: string): string {
  return `${parent ? parent.path : ''}/${code}`;
}

/** Thứ tự phân cấp: cha đứng trước, các con theo mã – dùng cho danh sách và cây sơ đồ. */
export function sortByHierarchy(areas: Area[]): Area[] {
  const result: Area[] = [];
  const visit = (parentCode: string | null) => {
    for (const area of childrenOf(areas, parentCode).sort((a, b) => a.code.localeCompare(b.code))) {
      result.push(area);
      visit(area.code);
    }
  };
  visit(null);
  return result;
}

export type ParentCheck =
  | { ok: true; level: number; suspended: boolean }
  | { ok: false; reason: ParentRejection; level: number };

/**
 * Kiểm tra một khu vực có được chọn làm khu vực cấp cha (UC-ARE-02 bước 5–6). Dùng chung cho hộp thoại ở FE
 * và lần kiểm tra lại ở server giả lập. Khi `editingCode` có giá trị (ngữ cảnh chỉnh sửa), chặn thêm vòng lặp
 * và trường hợp phân khu con của khu vực đang sửa bị đẩy quá Cấp 3.
 */
export function checkParentCandidate(areas: Area[], candidateCode: string, editingCode?: string): ParentCheck {
  const candidate = areas.find((a) => a.code === candidateCode);
  if (!candidate) return { ok: false, reason: 'NOT_FOUND', level: 0 };
  const level = candidate.level + 1;

  if (editingCode) {
    if (candidate.code === editingCode) return { ok: false, reason: 'SELF', level };
    if (candidate.path.split('/').includes(editingCode)) return { ok: false, reason: 'DESCENDANT', level };
  }
  if (level > MAX_AREA_LEVEL) return { ok: false, reason: 'MAX_LEVEL', level };
  if (editingCode) {
    if (areas.find((a) => a.code === editingCode)?.parentCode === candidate.code) {
      return { ok: false, reason: 'CURRENT_PARENT', level };
    }
    if (level + subtreeDepth(areas, editingCode) > MAX_AREA_LEVEL) return { ok: false, reason: 'SUBTREE_TOO_DEEP', level };
  }
  return { ok: true, level, suspended: candidate.status === 'suspended' };
}

/** Thông báo cho từng lý do chặn, theo frame 02.4 / 02.5. */
export const PARENT_REJECTION_TEXT: Record<ParentRejection, { title: string; body: string; tag: string }> = {
  MAX_LEVEL: {
    title: 'Không thể chọn khu vực Cấp 3 làm khu vực cấp cha',
    body: 'Quy hoạch mặt bằng chỉ cho phép tối đa 3 cấp logic: Cấp 1 (Cảng/ICD) → Cấp 2 (Bãi/Kho/Cầu bến) → Cấp 3 (Phân khu/Block). Không thể tạo phân khu con cho khu vực cấp 3.',
    tag: 'Đã ở Cấp 3',
  },
  SUBTREE_TOO_DEEP: {
    title: 'Phân khu con sẽ vượt quá giới hạn 3 cấp',
    body: 'Khu vực đang sửa có phân khu con trực thuộc; chuyển sang khu vực cha này sẽ đẩy các phân khu con xuống quá Cấp 3 (ARE-03). Hãy chọn khu vực Cấp 1.',
    tag: 'Vượt quá Cấp 3',
  },
  SELF: {
    title: 'Không thể chọn khu vực cấp cha này',
    body: 'Không thể chọn chính khu vực này hoặc phân khu con trực thuộc làm khu vực cấp cha.',
    tag: 'Chính khu vực này',
  },
  DESCENDANT: {
    title: 'Không thể chọn khu vực cấp cha này',
    body: 'Không thể chọn chính khu vực này hoặc phân khu con trực thuộc làm khu vực cấp cha.',
    tag: 'Phân khu con',
  },
  CURRENT_PARENT: {
    title: 'Đây là khu vực cấp cha hiện tại',
    body: 'Khu vực đang trực thuộc khu vực này. Chọn một khu vực cấp cha khác để thay đổi cấu trúc phân cấp.',
    tag: 'Cấp cha hiện tại',
  },
  NOT_FOUND: {
    title: 'Khu vực cấp cha không còn tồn tại',
    body: 'Khu vực được chọn không còn trong danh mục. Vui lòng chọn lại trên sơ đồ phân cấp.',
    tag: 'Không tồn tại',
  },
};

/** "/KV-CL/KV-CL-B1" → "KV-CL-B1 → KV-CL-B1-A2 → KV-CL-B1": chuỗi vòng lặp khi chọn phân khu con làm cha (02.5). */
export function describeCycle(candidate: Pick<Area, 'path'>, editingCode: string): string {
  const segments = candidate.path.split('/').filter(Boolean);
  const start = segments.indexOf(editingCode);
  return [...segments.slice(start), editingCode].join(' → ');
}

export function toRef(area: Pick<Area, 'code' | 'name'>): AreaRef {
  return { code: area.code, name: area.name };
}

export function asLevel(level: number): AreaLevel {
  return Math.min(Math.max(level, 1), MAX_AREA_LEVEL) as AreaLevel;
}
