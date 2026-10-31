import { ROLES } from '@/constants/roles';
import type { AuthUser } from '@/features/auth/types/auth';
import {
  AREA_PAGE_SIZE,
  AreaOperationError,
  AreaRecordsError,
  AreaSearchError,
  ChangeAreaParentError,
  CreateAreaError,
  UpdateAreaError,
  type Area,
  type AreaHistoryEntry,
  type AreaListItem,
  type AreaPathChange,
  type AreaRecordData,
  type AreaRecordGroup,
  type AreaReferences,
  type AreaSearchRequest,
  type AreaSearchResult,
  type AreaStaff,
  type AreaStatus,
  type AreaTypeCode,
  type AssignStaffRequest,
  type ChangeAreaParentRequest,
  type ChangeAreaStatusRequest,
  type EndStaffRequest,
  type SetServicesRequest,
  type ChangeAreaParentResult,
  type CreateAreaRequest,
  type CreateAreaResult,
  type UpdateAreaRequest,
  type UpdateAreaResult,
} from '@/features/areas/types/area';
import { diffAreaDraft, toAreaDraft } from '@/features/areas/utils/areaChanges';
import { areaTypeLabel, formatAreaSize, formatCapacity } from '@/features/areas/utils/areaFormat';
import {
  ancestryOf,
  asLevel,
  checkParentCandidate,
  childrenOf,
  descendantsOf,
  levelUnder,
  pathUnder,
  sortByHierarchy,
  toRef,
} from '@/features/areas/utils/areaHierarchy';
import {
  normalizeAreaDraft,
  normalizeAreaSearch,
  parseAreaNumber,
  sameAreaName,
  validateAreaDraft,
} from '@/features/areas/utils/areaValidation';
import { authorize } from './customersServer';
import { mockStore } from './mockStore';
import {
  AREA_CODE_SEQUENCE_START,
  SEED_AREAS,
  seedAreaId,
  SIMULATED_AREA_CONFLICT,
  SIMULATED_AREA_LATE_REFERENCE_CODE,
  SIMULATED_AREA_SAVE_ERROR_PREFIX,
  SIMULATED_AREA_SEARCH_FAILURE_KEYWORD,
} from './seed/areas';
import {
  EMPTY_AREA_RECORDS,
  LATE_REFERENCE_CONTRACT,
  SEED_AREA_RECORDS,
  SERVICE_CATALOG,
  SIMULATED_PRICE_LIST_FAILURE_AREA,
  STAFF_CATALOG,
} from './seed/areaRecords';

/** Bản đã lưu trong prototype thay cho bản mẫu cùng AreaId. Bản lưu từ phiên bản prototype cũ được bổ sung trường mới. */
function allAreas(): Area[] {
  const stored = mockStore.getStoredAreas().map((a) => ({
    ...a,
    id: a.id ?? seedAreaId(a.code),
    history: a.history.map((h) => ({ ...h, kind: h.kind ?? 'create', byTitle: h.byTitle ?? '', version: h.version ?? a.version })),
  }));
  const storedIds = new Set(stored.map((a) => a.id));
  return [...SEED_AREAS.filter((a) => !storedIds.has(a.id)), ...stored];
}

/** Mã hệ thống tự cấp dạng KV-000128 (A4), tăng dần và không dùng lại. */
function nextAreaCode(areas: Area[]): string {
  const issued = areas.map((a) => /^KV-(\d{6})$/.exec(a.code)?.[1]).filter(Boolean).map(Number);
  const next = Math.max(AREA_CODE_SEQUENCE_START, ...issued) + 1;
  return `KV-${String(next).padStart(6, '0')}`;
}

function newAreaId(): string {
  return typeof crypto.randomUUID === 'function' ? `area-${crypto.randomUUID()}` : `area-${Date.now()}`;
}

function titleOf(user: AuthUser): string {
  return user.roles.map((role) => ROLES[role].name).join(', ');
}

export function mockGetArea(code: string): Area | undefined {
  return allAreas().find((a) => a.code === code);
}

/** Toàn bộ sơ đồ mặt bằng hiện hành, theo thứ tự phân cấp (cây trong hộp thoại 02.1). */
export function mockGetAreaTree(): Area[] {
  return sortByHierarchy(allAreas());
}

/* ---------- Dữ liệu liên kết (UC-ARE-13) ---------- */

function recordsOf(areaId: string) {
  // Dịch vụ/nhân sự đã đổi trong prototype thay cho bản mẫu.
  const records = { ...(SEED_AREA_RECORDS[areaId] ?? EMPTY_AREA_RECORDS), ...mockStore.getAreaRecordOverride(areaId) };
  // 04.4: hợp đồng ký muộn đã được ghi nhận sau lần lưu đổi mã bị từ chối.
  const area = allAreas().find((a) => a.id === areaId);
  if (area && areaId === seedAreaId(SIMULATED_AREA_LATE_REFERENCE_CODE) && mockStore.hasTaken(`area-late-ref:${areaId}`)) {
    return { ...records, contracts: [...records.contracts, LATE_REFERENCE_CONTRACT] };
  }
  return records;
}

/** Số bảng giá, hợp đồng, kỳ sản lượng đang tham chiếu khu vực – có tham chiếu thì khóa mã (ARE-07). */
export function mockGetAreaReferences(areaId: string): AreaReferences {
  const records = recordsOf(areaId);
  return { priceLists: records.priceLists.length, contracts: records.contracts.length, outputPeriods: records.output?.periods ?? 0 };
}

function hasReferences(refs: AreaReferences): boolean {
  return refs.priceLists + refs.contracts + refs.outputPeriods > 0;
}

/** Tab Bảng giá của khu vực giả lập lỗi khi mở trang (13.8); "Thử lại" thành công. */
export function mockGetAreaRecords<G extends AreaRecordGroup>(
  userId: string,
  signedInAt: string,
  areaId: string,
  group: G,
  retry = false,
): AreaRecordData[G] {
  authorize(userId, signedInAt, 'areas.view', () => new AreaRecordsError(group));
  if (group === 'priceLists' && areaId === SIMULATED_PRICE_LIST_FAILURE_AREA && !retry) throw new AreaRecordsError(group);
  const records = recordsOf(areaId);
  const data: AreaRecordData = {
    services: records.services,
    staff: records.staff,
    priceLists: records.priceLists,
    contracts: { items: records.contracts, output: records.output },
  };
  return data[group];
}

/** 13.11: ghi nhật ký người xuất và thời điểm xuất file lý lịch. */
export function mockRecordAreaExport(userId: string, signedInAt: string, code: string, sections: string[]): string {
  const user = authorize(userId, signedInAt, 'areas.view', () => new AreaRecordsError('services'));
  mockStore.audit({ action: 'AREA_PROFILE_EXPORTED', username: user.username, detail: `Xuất lý lịch ${code}: ${sections.join(', ')}` });
  return user.fullName;
}

/* ---------- Thao tác của Trưởng phòng Khai thác (13.1 / 13.3 / 13.4) ---------- */

const STATUS_LABEL: Record<AreaStatus, string> = { active: 'Hoạt động', suspended: 'Tạm ngưng' };

export function mockGetAreaOperationCatalogs() {
  return { staff: STAFF_CATALOG, services: SERVICE_CATALOG };
}

/** Kiểm tra phiên, quyền chỉ Trưởng phòng Khai thác và khu vực còn tồn tại. */
function authorizeOperation(userId: string, signedInAt: string, code: string): { user: AuthUser; area: Area } {
  const user = authorize(userId, signedInAt, 'areas.manage', (errorCode, sessionStatus) => {
    if (errorCode === 'FORBIDDEN') mockStore.audit({ action: 'AREA_OPERATION_REJECTED', username: '', detail: `Không có quyền thao tác ${code}` });
    return new AreaOperationError(errorCode, { sessionStatus });
  });
  const area = allAreas().find((a) => a.code === code);
  if (!area) throw new AreaOperationError('NOT_FOUND');
  return { user, area };
}

/** Ghi mục lịch sử nhân sự & dịch vụ: không đổi phiên bản hồ sơ khu vực (ARE-11). */
function assignmentEntry(user: AuthUser, area: Area, action: string, detail: string, reason?: string): Area {
  return {
    ...area,
    history: [
      ...area.history,
      { kind: 'assignment', action, by: user.fullName, byTitle: titleOf(user), at: new Date().toISOString(), version: area.version, detail, reason },
    ],
  };
}

/** Phân công một nhân viên Khai thác phụ trách khu vực theo ca trực (13.4). */
export function mockAssignAreaStaff({ userId, signedInAt, code, staffCode, title, shift, since }: AssignStaffRequest): AreaStaff {
  const { user, area } = authorizeOperation(userId, signedInAt, code);
  const person = STAFF_CATALOG.find((s) => s.staffCode === staffCode);
  if (!person || !title.trim() || !shift || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new AreaOperationError('VALIDATION');
  const current = recordsOf(area.id).staff;
  if (current.some((s) => s.staffCode === staffCode)) throw new AreaOperationError('ALREADY_ASSIGNED');

  const assigned: AreaStaff = { name: person.name, staffCode, title: title.trim(), shift, since, phone: person.phone };
  const detail = `Phân công ${person.name} (${staffCode}) – ${assigned.title}, ${shift}, từ ${since.split('-').reverse().join('/')}.`;
  mockStore.saveAreaRecords(area.id, { staff: [...current, assigned] }, assignmentEntry(user, area, 'Phân công nhân sự', detail));
  mockStore.audit({ action: 'AREA_STAFF_ASSIGNED', username: user.username, detail: `${code}: ${detail}` });
  return assigned;
}

/** Kết thúc phân công một nhân viên khỏi khu vực, có lý do để ghi nhật ký. */
export function mockEndAreaStaff({ userId, signedInAt, code, staffCode, reason }: EndStaffRequest): void {
  const { user, area } = authorizeOperation(userId, signedInAt, code);
  if (!reason.trim()) throw new AreaOperationError('VALIDATION');
  const current = recordsOf(area.id).staff;
  const person = current.find((s) => s.staffCode === staffCode);
  if (!person) throw new AreaOperationError('NOT_FOUND');

  const detail = `Kết thúc phân công ${person.name} (${staffCode}) – ${person.shift}.`;
  mockStore.saveAreaRecords(
    area.id,
    { staff: current.filter((s) => s.staffCode !== staffCode) },
    assignmentEntry(user, area, 'Kết thúc phân công', detail, reason.trim()),
  );
  mockStore.audit({ action: 'AREA_STAFF_ENDED', username: user.username, detail: `${code}: ${detail} Lý do: ${reason.trim()}` });
}

/** Cập nhật danh mục dịch vụ được phép cung cấp tại khu vực (13.3); dịch vụ giữ nguyên thì giữ ngày áp dụng cũ. */
export function mockSetAreaServices({ userId, signedInAt, code, serviceNames, since, reason }: SetServicesRequest): void {
  const { user, area } = authorizeOperation(userId, signedInAt, code);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || serviceNames.some((n) => !SERVICE_CATALOG.some((s) => s.name === n))) {
    throw new AreaOperationError('VALIDATION');
  }
  const current = recordsOf(area.id).services;
  const added = serviceNames.filter((n) => !current.some((s) => s.name === n));
  const removed = current.filter((s) => !serviceNames.includes(s.name)).map((s) => s.name);
  if (added.length === 0 && removed.length === 0) throw new AreaOperationError('NO_CHANGES');

  const next = [
    ...current.filter((s) => serviceNames.includes(s.name)),
    ...SERVICE_CATALOG.filter((s) => added.includes(s.name)).map((s) => ({ ...s, since })),
  ];
  const parts = [
    added.length > 0 && `thêm ${added.map((n) => `"${n}"`).join(', ')}`,
    removed.length > 0 && `gỡ ${removed.map((n) => `"${n}"`).join(', ')}`,
  ].filter(Boolean) as string[];
  const joined = parts.join('; ');
  const sentence = `${joined.charAt(0).toUpperCase()}${joined.slice(1)} trong danh mục dịch vụ được phép.`;
  mockStore.saveAreaRecords(area.id, { services: next }, assignmentEntry(user, area, 'Gán dịch vụ', sentence, reason.trim() || undefined));
  mockStore.audit({ action: 'AREA_SERVICES_UPDATED', username: user.username, detail: `${code}: ${sentence}` });
}

/**
 * Tạm ngưng / mở lại khu vực: đổi trạng thái trên đúng phiên bản đang xem, tăng phiên bản và ghi nhật ký kèm lý do.
 * Tạm ngưng không chấm dứt hợp đồng, bảng giá đang có; chỉ chặn phát sinh giao dịch mới tại khu vực và phân khu con.
 */
export function mockChangeAreaStatus({ userId, signedInAt, code, baseVersion, status, reason }: ChangeAreaStatusRequest): Area {
  const { user, area } = authorizeOperation(userId, signedInAt, code);
  if (!reason.trim()) throw new AreaOperationError('VALIDATION');
  if (area.status === status) throw new AreaOperationError('SAME_STATUS');
  if (area.version !== baseVersion) throw new AreaOperationError('CONFLICT');

  const next: Area = { ...area, status, version: area.version + 1 };
  const detail = `${STATUS_LABEL[area.status]} → ${STATUS_LABEL[status]}.`;
  next.history = [
    ...area.history,
    {
      kind: 'status',
      action: status === 'suspended' ? 'Tạm ngưng khu vực' : 'Mở lại hoạt động',
      by: user.fullName,
      byTitle: titleOf(user),
      at: new Date().toISOString(),
      version: next.version,
      detail,
      reason: reason.trim(),
    },
  ];
  mockStore.saveAreas([next]);
  mockStore.audit({
    action: 'AREA_STATUS_CHANGED',
    username: user.username,
    detail: `${code} v${area.version} → v${next.version}: ${detail} Lý do: ${reason.trim()}`,
  });
  return next;
}

/* ---------- UC-ARE-01 · Tạo mới ---------- */

/** Khu vực cùng khu vực cấp cha trực tiếp đã dùng tên này (ARE-02). */
function findSiblingWithName(areas: Area[], parentCode: string | null, name: string, exceptId?: string): Area | undefined {
  return areas.find((a) => a.parentCode === parentCode && a.id !== exceptId && sameAreaName(a.name, name));
}

/**
 * Giả lập API tạo khu vực theo UC-ARE-01: kiểm tra phiên và quyền, idempotency, kiểm tra lại dữ liệu, mã duy nhất
 * (ARE-01), khu vực cấp cha hợp lệ (ARE-03), tên không trùng trong cùng khu vực cha (ARE-02), rồi lưu hồ sơ
 * với trạng thái Hoạt động và ghi Audit log (ARE-11).
 */
export function mockCreateArea({ userId, signedInAt, idempotencyKey, draft }: CreateAreaRequest): CreateAreaResult {
  const user = authorize(userId, signedInAt, 'areas.create', (code, sessionStatus) => {
    if (code === 'FORBIDDEN') {
      mockStore.audit({ action: 'AREA_CREATE_REJECTED', username: '', detail: `Không có quyền tạo khu vực (${userId})` });
    }
    return new CreateAreaError(code, { sessionStatus });
  });

  // 01.5: thử lại sau lỗi kết nối → trả lại hồ sơ đã ghi ở lần trước, không tạo trùng.
  const processedCode = mockStore.getAreaCodeByRequest(idempotencyKey);
  if (processedCode) return { area: mockGetArea(processedCode)!, replayed: true };

  const data = normalizeAreaDraft(draft);
  const fieldErrors = validateAreaDraft(data);
  if (Object.keys(fieldErrors).length > 0) throw new CreateAreaError('VALIDATION', { fieldErrors });

  const areas = allAreas();

  // ARE-01: mã khu vực duy nhất trên toàn hệ thống.
  const sameCode = data.code ? areas.find((a) => a.code === data.code) : undefined;
  if (sameCode) {
    mockStore.audit({ action: 'AREA_CREATE_REJECTED', username: user.username, detail: `Mã ${data.code} đã tồn tại` });
    throw new CreateAreaError('DUPLICATE_CODE', { existing: toRef(sameCode) });
  }

  // UC-ARE-02 bước 5–6: kiểm tra lại khu vực cấp cha ngay trước khi ghi.
  const parent = data.parentCode ? areas.find((a) => a.code === data.parentCode) ?? null : null;
  if (data.parentCode) {
    const check = checkParentCandidate(areas, data.parentCode);
    if (!check.ok) {
      mockStore.audit({ action: 'AREA_CREATE_REJECTED', username: user.username, detail: `Khu vực cha ${data.parentCode}: ${check.reason}` });
      throw new CreateAreaError('INVALID_PARENT', { parentRejection: check.reason });
    }
  }

  // ARE-02: tên không trùng với khu vực có cùng khu vực cấp cha trực tiếp.
  const sameName = findSiblingWithName(areas, parent?.code ?? null, data.name);
  if (sameName) {
    mockStore.audit({ action: 'AREA_CREATE_REJECTED', username: user.username, detail: `Tên "${data.name}" trùng ${sameName.code}` });
    throw new CreateAreaError('DUPLICATE_NAME', { existing: toRef(sameName), parent: parent ? toRef(parent) : undefined });
  }

  // 01.5: lỗi kết nối CSDL → không ghi gì, dữ liệu trên biểu mẫu được giữ.
  if (data.code.startsWith(SIMULATED_AREA_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`area-save:${idempotencyKey}`)) {
    mockStore.audit({ action: 'AREA_CREATE_ERROR', username: user.username, detail: 'Lỗi kết nối CSDL, chưa ghi hồ sơ' });
    throw new CreateAreaError('SAVE_FAILED');
  }

  const code = data.code || nextAreaCode(areas);
  const now = new Date().toISOString();
  const areaSize = data.areaSize ? parseAreaNumber(data.areaSize) : null;
  const capacity = data.capacity ? parseAreaNumber(data.capacity) : null;
  const initialParams = [
    `Tên: ${data.name}`,
    `Loại: ${areaTypeLabel(data.type as AreaTypeCode)}`,
    `Khu vực cha: ${parent ? parent.code : 'không (Cấp 1)'}`,
    `Diện tích: ${formatAreaSize(areaSize)}`,
    `Sức chứa: ${formatCapacity(capacity, data.capacityUnit)}`,
  ].join('; ');
  const area: Area = {
    id: newAreaId(),
    code,
    name: data.name,
    type: data.type as AreaTypeCode,
    parentCode: parent?.code ?? null,
    level: asLevel(levelUnder(parent)),
    path: pathUnder(parent, code),
    gps: data.gps,
    areaSize,
    capacity,
    capacityUnit: data.capacityUnit,
    standards: data.standards,
    status: 'active',
    version: 1,
    createdAt: now,
    createdBy: user.fullName,
    createdByTitle: titleOf(user),
    history: [
      {
        kind: 'create',
        action: 'Tạo mới khu vực',
        by: user.fullName,
        byTitle: titleOf(user),
        at: now,
        version: 1,
        detail: `Khởi tạo với trạng thái Hoạt động. ${initialParams}.`,
        requestId: idempotencyKey,
      },
    ],
  };
  mockStore.saveAreas([area], { idempotencyKey, code });
  mockStore.audit({ action: 'AREA_CREATED', username: user.username, detail: `Tạo ${code} – ${area.name}. ${initialParams}` });
  return { area, replayed: false };
}

/* ---------- Đổi vị trí trong sơ đồ (dùng chung UC-ARE-02 và UC-ARE-04) ---------- */

/**
 * Áp mã/khu vực cha mới cho khu vực và đồng bộ ParentAreaId, Level, HierarchyPath của mọi phân khu con trực thuộc.
 * Trả về các bản ghi cần lưu cùng bảng đối chiếu đường dẫn trước → sau (02.7).
 */
function relocate(areas: Area[], current: Area, next: Area): { saved: Area[]; pathChanges: AreaPathChange[] } {
  // Không đổi mã/khu vực cha → đường dẫn của khu vực và phân khu con giữ nguyên.
  if (next.path === current.path) return { saved: [next], pathChanges: [] };
  const pathChanges: AreaPathChange[] = [
    { code: next.code, name: next.name, levelBefore: current.level, level: next.level, pathBefore: current.path, path: next.path },
  ];
  const synced = descendantsOf(areas, current.code).map((child) => {
    const path = next.path + child.path.slice(current.path.length);
    const level = asLevel(child.level + next.level - current.level);
    const parentCode = child.parentCode === current.code ? next.code : child.parentCode;
    pathChanges.push({ code: child.code, name: child.name, levelBefore: child.level, level, pathBefore: child.path, path });
    return { ...child, path, level, parentCode };
  });
  return { saved: [next, ...synced], pathChanges };
}

/**
 * Giả lập API đổi khu vực cấp cha (UC-ARE-02 trong ngữ cảnh chỉnh sửa UC-ARE-04): kiểm tra cấp độ, chống vòng lặp,
 * tên trùng trong khu vực cha mới, phiên bản đang xem; lưu ParentAreaId/Level/HierarchyPath mới và đồng bộ đường dẫn
 * của các phân khu con trong cùng một lần ghi (02.7).
 */
export function mockChangeAreaParent(request: ChangeAreaParentRequest): ChangeAreaParentResult {
  const { userId, signedInAt, idempotencyKey, code, baseVersion, parentCode } = request;
  const user = authorize(userId, signedInAt, 'areas.update', (errorCode, sessionStatus) => new ChangeAreaParentError(errorCode, { sessionStatus }));

  const areas = allAreas();
  const current = areas.find((a) => a.code === code);
  if (!current) throw new ChangeAreaParentError('NOT_FOUND');

  // Thử lại sau khi đã ghi → không áp lại lần nữa; trang chi tiết chỉ báo đã lưu ở lần gửi trước.
  if (mockStore.getAreaCodeByRequest(idempotencyKey) === code) {
    return { area: current, changes: [], previousParent: null, replayed: true };
  }

  if (current.version !== baseVersion) throw new ChangeAreaParentError('CONFLICT');

  const check = checkParentCandidate(areas, parentCode, code);
  if (!check.ok) {
    mockStore.audit({ action: 'AREA_HIERARCHY_REJECTED', username: user.username, detail: `${code} → ${parentCode}: ${check.reason}` });
    throw new ChangeAreaParentError('INVALID_PARENT', { parentRejection: check.reason });
  }
  const parent = areas.find((a) => a.code === parentCode)!;

  const sameName = findSiblingWithName(areas, parent.code, current.name, current.id);
  if (sameName) throw new ChangeAreaParentError('DUPLICATE_NAME', { existing: toRef(sameName) });

  const previousParent = current.parentCode ? areas.find((a) => a.code === current.parentCode) ?? null : null;
  const moved: Area = { ...current, parentCode: parent.code, level: asLevel(levelUnder(parent)), path: pathUnder(parent, code), version: current.version + 1 };
  const { saved, pathChanges } = relocate(areas, current, moved);

  const detail = `Điều chỉnh khu vực cấp cha: ${previousParent?.code ?? '(Cấp 1)'} → ${parent.code}; đồng bộ đường dẫn ${pathChanges.length - 1} phân khu con.`;
  moved.history = [
    ...current.history,
    {
      kind: 'update',
      action: 'Cập nhật cấu trúc phân cấp',
      by: user.fullName,
      byTitle: titleOf(user),
      at: new Date().toISOString(),
      version: moved.version,
      detail,
      changes: [{ field: 'parentCode', before: previousParent?.code ?? 'Không có (Cấp 1)', after: parent.code }],
      requestId: idempotencyKey,
    },
  ];
  mockStore.saveAreas(saved, { idempotencyKey, code });
  mockStore.audit({ action: 'AREA_HIERARCHY_UPDATED', username: user.username, detail: `${code}: ${detail}` });

  return { area: moved, changes: pathChanges, previousParent: previousParent ? toRef(previousParent) : null, replayed: false };
}

/* ---------- UC-ARE-04 · Cập nhật thông tin ---------- */

/** 04.5: người khác lưu phiên bản mới trước khi lần lưu của người đang sửa tới server. */
function applyConcurrentEdit(current: Area): Area {
  const { by, byTitle, areaSize, gps, reason } = SIMULATED_AREA_CONFLICT;
  const before = toAreaDraft(current);
  const next: Area = { ...current, areaSize, gps, version: current.version + 1 };
  const changes = diffAreaDraft(before, toAreaDraft(next));
  next.history = [
    ...current.history,
    {
      kind: 'update',
      action: 'Cập nhật thông tin',
      by,
      byTitle,
      at: new Date().toISOString(),
      version: next.version,
      detail: changes.map((c) => `${c.before} → ${c.after}`).join(' · '),
      changes,
      reason,
    },
  ];
  mockStore.saveAreas([next]);
  return next;
}

/**
 * Giả lập API cập nhật khu vực theo UC-ARE-04: kiểm tra phiên/quyền, idempotency, phiên bản đang sửa (optimistic
 * concurrency), dữ liệu và lý do, khóa mã khi đã có tham chiếu (ARE-07), mã duy nhất (ARE-01), khu vực cha (ARE-03),
 * tên trùng trong khu vực cha (ARE-02); lưu phiên bản mới, ghi Audit log trước/sau và lý do (ARE-11). Không đụng tới
 * dữ liệu đã lưu trên bảng giá, hợp đồng, phiếu sản lượng (ARE-08).
 */
export function mockUpdateArea(request: UpdateAreaRequest): UpdateAreaResult {
  const { userId, signedInAt, idempotencyKey, code, baseVersion, draft, reason } = request;
  const user = authorize(userId, signedInAt, 'areas.update', (errorCode, sessionStatus) => {
    if (errorCode === 'FORBIDDEN') mockStore.audit({ action: 'AREA_UPDATE_REJECTED', username: '', detail: `Không có quyền cập nhật ${code}` });
    return new UpdateAreaError(errorCode, { sessionStatus });
  });

  // Thử lại cùng một lần lưu → trả bản đã ghi, không áp lại.
  const processed = mockStore.getAreaCodeByRequest(idempotencyKey);
  if (processed) {
    const area = mockGetArea(processed)!;
    const entry = area.history.find((h) => h.requestId === idempotencyKey);
    return { area, changes: entry?.changes ?? [], pathChanges: [], previousParent: null, replayed: true };
  }

  let areas = allAreas();
  let current = areas.find((a) => a.code === code);
  if (!current) throw new UpdateAreaError('NOT_FOUND');

  if (code === SIMULATED_AREA_CONFLICT.code && mockStore.takeOnce(`area-conflict:${current.id}`)) {
    current = applyConcurrentEdit(current);
    areas = allAreas();
  }
  // 04.5: phiên bản đã đổi → không ghi đè.
  if (current.version !== baseVersion) {
    const last = current.history[current.history.length - 1];
    mockStore.audit({ action: 'AREA_UPDATE_REJECTED', username: user.username, detail: `${code}: phiên bản ${baseVersion} đã cũ` });
    throw new UpdateAreaError('CONFLICT', { conflict: { latest: current, updatedBy: last.by, updatedAt: last.at } });
  }

  // 04.2: dữ liệu không hợp lệ hoặc thiếu lý do.
  const data = normalizeAreaDraft(draft);
  const fieldErrors = validateAreaDraft(data);
  if (Object.keys(fieldErrors).length > 0 || !reason.trim()) throw new UpdateAreaError('VALIDATION', { fieldErrors });

  const changes = diffAreaDraft(toAreaDraft(current), data);
  if (changes.length === 0) throw new UpdateAreaError('NO_CHANGES');
  const newCode = data.code || current.code;

  if (newCode !== current.code) {
    // 04.4: hợp đồng vừa được ký với khu vực sau khi biểu mẫu mở (giả lập), hoặc request cố ý bỏ qua khóa mã.
    if (current.code === SIMULATED_AREA_LATE_REFERENCE_CODE) mockStore.takeOnce(`area-late-ref:${current.id}`);
    const references = mockGetAreaReferences(current.id);
    if (hasReferences(references)) {
      mockStore.audit({ action: 'AREA_UPDATE_REJECTED', username: user.username, detail: `Đổi mã ${current.code} → ${newCode} khi đã có tham chiếu` });
      throw new UpdateAreaError('CODE_LOCKED', { references });
    }
    // 04.8: mã mới vẫn phải duy nhất trên toàn hệ thống (ARE-01).
    const sameCode = areas.find((a) => a.code === newCode && a.id !== current!.id);
    if (sameCode) throw new UpdateAreaError('DUPLICATE_CODE', { existing: toRef(sameCode) });
  }

  const parentCode = data.parentCode || null;
  const parent = parentCode ? areas.find((a) => a.code === parentCode) ?? null : null;
  if (parentCode !== current.parentCode && parentCode) {
    const check = checkParentCandidate(areas, parentCode, current.code);
    if (!check.ok) throw new UpdateAreaError('INVALID_PARENT', { parentRejection: check.reason });
  }

  const sameName = findSiblingWithName(areas, parentCode, data.name, current.id);
  if (sameName) {
    mockStore.audit({ action: 'AREA_UPDATE_REJECTED', username: user.username, detail: `Tên "${data.name}" trùng ${sameName.code}` });
    throw new UpdateAreaError('DUPLICATE_NAME', { existing: toRef(sameName), parent: parent ? toRef(parent) : undefined });
  }

  const now = new Date().toISOString();
  const next: Area = {
    ...current,
    code: newCode,
    name: data.name,
    type: data.type as AreaTypeCode,
    parentCode,
    level: asLevel(levelUnder(parent)),
    path: pathUnder(parent, newCode),
    gps: data.gps,
    areaSize: data.areaSize ? parseAreaNumber(data.areaSize) : null,
    capacity: data.capacity ? parseAreaNumber(data.capacity) : null,
    capacityUnit: data.capacityUnit,
    standards: data.standards,
    version: current.version + 1,
  };
  const entry: AreaHistoryEntry = {
    kind: 'update',
    action: 'Cập nhật thông tin',
    by: user.fullName,
    byTitle: titleOf(user),
    at: now,
    version: next.version,
    detail: changes.map((c) => `${c.before} → ${c.after}`).join(' · '),
    changes,
    reason: reason.trim(),
    requestId: idempotencyKey,
  };
  next.history = [...current.history, entry];
  const { saved, pathChanges } = relocate(areas, current, next);
  mockStore.saveAreas(saved, { idempotencyKey, code: newCode });
  mockStore.audit({
    action: 'AREA_UPDATED',
    username: user.username,
    detail: `${current.code} v${baseVersion} → v${next.version}: ${changes.map((c) => c.field).join(', ')}. Lý do: ${entry.reason}`,
  });

  const previous = current.parentCode ? areas.find((a) => a.code === current!.parentCode) ?? null : null;
  return { area: next, changes, pathChanges, previousParent: previous ? toRef(previous) : null, replayed: false };
}

/* ---------- UC-ARE-12 · Tra cứu ---------- */

function toListItem(areas: Area[], a: Area): AreaListItem {
  return {
    code: a.code,
    name: a.name,
    type: a.type,
    parentCode: a.parentCode,
    level: a.level,
    areaSize: a.areaSize,
    capacity: a.capacity,
    capacityUnit: a.capacityUnit,
    status: a.status,
    childCount: childrenOf(areas, a.code).length,
  };
}

/** Lỗi tải danh sách chỉ xảy ra trước lần "Tải lại trang" đầu tiên (12.5). */
let searchFailureShown = false;

/**
 * Tra cứu khu vực (01.0 / 12.1 → 12.6): lọc trạng thái, loại mặt bằng, khu vực cha, từ khóa không phân biệt hoa thường
 * và có/không dấu; sắp theo thứ tự phân cấp. Sơ đồ cây (`all`) nhận toàn bộ kết quả cùng khu vực cha để dựng cây.
 */
export function mockSearchAreas(request: AreaSearchRequest): AreaSearchResult {
  authorize(request.userId, request.signedInAt, 'areas.view', (code, sessionStatus) => new AreaSearchError(code, { sessionStatus }));
  const keyword = normalizeAreaSearch(request.keyword);
  if (keyword === SIMULATED_AREA_SEARCH_FAILURE_KEYWORD && !(request.retry && searchFailureShown)) {
    searchFailureShown = true;
    throw new AreaSearchError('LOAD_FAILED');
  }

  const areas = allAreas();
  const matches = sortByHierarchy(areas)
    .filter((a) => request.status === 'all' || a.status === request.status)
    .filter((a) => !request.type || a.type === request.type)
    .filter((a) => !request.parentCode || a.parentCode === request.parentCode)
    .filter((a) => !keyword || normalizeAreaSearch(a.name).includes(keyword) || a.code.toLowerCase().includes(keyword));

  if (request.all) {
    const matched = new Set(matches.map((a) => a.code));
    const context = new Map<string, Area>();
    for (const a of matches) {
      for (const ancestor of ancestryOf(areas, a.code)) if (!matched.has(ancestor.code)) context.set(ancestor.code, ancestor);
    }
    return {
      items: matches.map((a) => toListItem(areas, a)),
      context: [...context.values()].map((a) => toListItem(areas, a)),
      total: matches.length,
      page: 1,
      size: matches.length,
    };
  }

  const size = AREA_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const page = Math.min(Math.max(1, request.page), pages);
  return {
    items: matches.slice((page - 1) * size, page * size).map((a) => toListItem(areas, a)),
    context: [],
    total: matches.length,
    page,
    size,
  };
}
