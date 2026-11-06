import { apiRequest, ApiError } from '@/lib/http/client';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import {
  mockAssignAreaStaff,
  mockChangeAreaParent,
  mockChangeAreaStatus,
  mockCreateArea,
  mockEndAreaStaff,
  mockGetAreaOperationCatalogs,
  mockSetAreaServices,
  mockGetArea,
  mockGetAreaRecords,
  mockGetAreaReferences,
  mockGetAreaTree,
  mockRecordAreaExport,
  mockSearchAreas,
  mockUpdateArea,
} from '@/mocks/areasServer';
import { mockStore } from '@/mocks/mockStore';
import {
  AreaSearchError,
  CreateAreaError,
  UpdateAreaError,
  ChangeAreaParentError,
  AreaOperationError,
  type Area,
  type AreaHistoryEntry,
  type AreaHistoryKind,
  type AreaListItem,
  type AreaPriceList,
  type AreaService,
  type AreaStaff,
  type AreaStatus,
  type AssignStaffRequest,
  type ChangeAreaStatusRequest,
  type EndStaffRequest,
  type SetServicesRequest,
  type ServiceOption,
  type StaffOption,
  type AreaRecordData,
  type AreaRecordGroup,
  type AreaReferences,
  type AreaSearchRequest,
  type AreaSearchResult,
  type ChangeAreaParentRequest,
  type ChangeAreaParentResult,
  type CreateAreaRequest,
  type CreateAreaResult,
  type UpdateAreaRequest,
  type UpdateAreaResult,
} from '../types/area';

/**
 * Chuyển đổi AreaDto từ Backend API thành Area object của Frontend UI.
 */
function mapDtoToArea(dto: any): Area {
  let parentCode: string | null = dto.parentAreaCode || null;
  if (!parentCode && dto.hierarchyPath) {
    const parts = dto.hierarchyPath.split('/').filter(Boolean);
    if (parts.length > 1) {
      parentCode = parts[parts.length - 2];
    }
  }

  const statusStr: AreaStatus =
    dto.status === 0 || dto.status === 'active' || String(dto.status).toLowerCase() === 'active'
      ? 'active'
      : 'suspended';

  const historyEntries: AreaHistoryEntry[] = (dto.history || []).map((h: any) => ({
    kind: (h.kind || 'update') as AreaHistoryKind,
    action: h.action || 'Thao tác hồ sơ',
    by: h.by || 'Hệ thống',
    byTitle: h.byTitle || 'Quản trị viên',
    at: h.at || new Date().toISOString(),
    version: Number(h.version || 1),
    detail: h.detail || '',
    reason: h.reason || undefined,
  }));

  if (historyEntries.length === 0) {
    historyEntries.push({
      kind: 'create',
      action: 'Tạo mới khu vực',
      by: dto.createdBy || 'Phạm Dung Demo',
      byTitle: dto.createdByTitle || 'Trưởng phòng Khai thác',
      at: dto.createdAt || new Date().toISOString(),
      version: 1,
      detail: `Khởi tạo hồ sơ khu vực ${dto.areaCode || dto.code || ''}`,
    });
  }

  return {
    id: dto.areaId || dto.id,
    code: dto.areaCode || dto.code,
    name: dto.areaName || dto.name,
    type: (dto.areaType || dto.type || 'kho_cfs') as any,
    parentCode,
    level: (dto.level || 1) as any,
    path: dto.hierarchyPath || dto.path || `/${dto.areaCode || dto.code}`,
    gps: dto.coordinates || dto.gps || '',
    areaSize: dto.areaM2 != null ? Number(dto.areaM2) : (dto.areaSize != null ? Number(dto.areaSize) : null),
    capacity: dto.capacity != null ? Number(dto.capacity) : null,
    capacityUnit: 'TEU',
    standards: dto.technicalDescription || dto.standards || '',
    status: statusStr,
    version: dto.rowVersion != null ? dto.rowVersion : (dto.version || 1),
    createdAt: dto.createdAt || new Date().toISOString(),
    createdBy: dto.createdBy || 'Hệ thống',
    createdByTitle: dto.createdByTitle || 'Quản trị viên',
    history: historyEntries,
  };
}

/**
 * Chuyển đổi AreaDto thành AreaListItem để hiển thị trên bảng tra cứu.
 */
function mapDtoToListItem(dto: any): AreaListItem {
  let parentCode: string | null = dto.parentAreaCode || null;
  if (!parentCode && dto.hierarchyPath) {
    const parts = dto.hierarchyPath.split('/').filter(Boolean);
    if (parts.length > 1) {
      parentCode = parts[parts.length - 2];
    }
  }

  const statusStr: AreaStatus =
    dto.status === 0 || dto.status === 'active' || String(dto.status).toLowerCase() === 'active'
      ? 'active'
      : 'suspended';

  return {
    code: dto.areaCode || dto.code,
    name: dto.areaName || dto.name,
    type: (dto.areaType || dto.type || 'kho_cfs') as any,
    parentCode,
    level: (dto.level || 1) as any,
    areaSize: dto.areaM2 != null ? Number(dto.areaM2) : (dto.areaSize != null ? Number(dto.areaSize) : null),
    capacity: dto.capacity != null ? Number(dto.capacity) : null,
    capacityUnit: 'TEU',
    status: statusStr,
    childCount: dto.children ? dto.children.length : 0,
  };
}

let _cachedCatalogs: { staff: StaffOption[]; services: ServiceOption[] } | null = null;

/*
 * Lớp API của feature areas: gọi trực tiếp Backend Web API qua apiRequest,
 * đồng thời đồng bộ trạng thái cục bộ để đảm bảo các màn hình hiển thị tức thì.
 */
export const areasApi = {
  /** UC-ARE-01: Tạo mới khu vực khai thác. */
  async create(request: CreateAreaRequest): Promise<CreateAreaResult> {
    try {
      let parentAreaId: string | null = null;
      if (request.draft.parentCode) {
        const parent = mockGetArea(request.draft.parentCode);
        if (parent) parentAreaId = parent.id;
      }

      const payload = {
        areaCode: request.draft.code || '',
        areaName: request.draft.name,
        areaType: request.draft.type,
        parentAreaId,
        coordinates: request.draft.gps || null,
        areaM2: Number(request.draft.areaSize || 0),
        capacity: Number(request.draft.capacity || 0),
        technicalDescription: request.draft.standards || null,
      };

      const res = await apiRequest<any>('/areas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const area = mapDtoToArea(res);
      mockStore.saveAreas([area], { idempotencyKey: request.idempotencyKey, code: area.code });
      return { area, replayed: false };
    } catch (error) {
      console.error('areasApi.search error:', error);
      if (error instanceof ApiError && (error.status === 401 || error.code === 'SESSION_ENDED')) {
        throw new CreateAreaError('SESSION_ENDED');
      }
      if (error instanceof ApiError && error.status === 403) {
        throw new CreateAreaError('FORBIDDEN');
      }
      if (error instanceof ApiError && error.status === 409) {
        throw new CreateAreaError('DUPLICATE_CODE');
      }
      if (!IS_MOCK_AUTH) {
        throw new CreateAreaError('VALIDATION');
      }
      return mockCreateArea(request);
    }
  },

  /** UC-ARE-04: Cập nhật thông tin và quy chuẩn kỹ thuật trên đúng phiên bản đang sửa. */
  async update(request: UpdateAreaRequest): Promise<UpdateAreaResult> {
    try {
      const payload = {
        areaName: request.draft.name,
        areaType: request.draft.type,
        coordinates: request.draft.gps || null,
        areaM2: Number(request.draft.areaSize || 0),
        capacity: Number(request.draft.capacity || 0),
        technicalDescription: request.draft.standards || null,
        rowVersion: request.baseVersion,
      };

      const res = await apiRequest<any>(`/areas/${encodeURIComponent(request.code)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      const updated = mapDtoToArea(res);
      mockStore.saveAreas([updated]);
      return { area: updated, changes: [], pathChanges: [], previousParent: null, replayed: false };
    } catch (error) {
      console.error('areasApi.search error:', error);
      if (error instanceof ApiError && (error.status === 401 || error.code === 'SESSION_ENDED')) {
        throw new UpdateAreaError('SESSION_ENDED');
      }
      if (error instanceof ApiError && error.status === 403) {
        throw new UpdateAreaError('FORBIDDEN');
      }
      if (error instanceof ApiError && error.status === 409) {
        throw new UpdateAreaError('CONFLICT');
      }
      if (!IS_MOCK_AUTH) {
        throw new UpdateAreaError('VALIDATION');
      }
      return mockUpdateArea(request);
    }
  },

  /** UC-ARE-02: Đổi khu vực cấp cha và đồng bộ đường dẫn phân khu con. */
  async changeParent(request: ChangeAreaParentRequest): Promise<ChangeAreaParentResult> {
    try {
      const payload = {
        newParentCode: request.parentCode || null,
        rowVersion: request.baseVersion,
      };

      const res = await apiRequest<any>(`/areas/${encodeURIComponent(request.code)}/parent`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      const updated = mapDtoToArea(res);
      mockStore.saveAreas([updated], { idempotencyKey: request.idempotencyKey, code: updated.code });
      return {
        area: updated,
        changes: [
          {
            code: updated.code,
            name: updated.name,
            levelBefore: updated.level,
            level: updated.level,
            pathBefore: updated.path,
            path: updated.path,
          },
        ],
        previousParent: null,
        replayed: false,
      };
    } catch (error) {
      console.error('areasApi.search error:', error);
      if (error instanceof ApiError && (error.status === 401 || error.code === 'SESSION_ENDED')) {
        throw new ChangeAreaParentError('SESSION_ENDED');
      }
      if (error instanceof ApiError && error.status === 403) {
        throw new ChangeAreaParentError('FORBIDDEN');
      }
      if (error instanceof ApiError && error.status === 409) {
        throw new ChangeAreaParentError('CONFLICT');
      }
      if (!IS_MOCK_AUTH) {
        throw new ChangeAreaParentError('INVALID_PARENT');
      }
      return mockChangeAreaParent(request);
    }
  },

  /** UC-ARE-12: Tra cứu khu vực (bảng có phân trang hoặc toàn bộ cho sơ đồ cây). */
  async search(request: AreaSearchRequest): Promise<AreaSearchResult> {
    try {
      const params = new URLSearchParams();
      if (request.keyword?.trim()) params.set('keyword', request.keyword.trim());
      if (request.status === 'active') params.set('status', 'Active');
      else if (request.status === 'suspended') params.set('status', 'Suspended');
      if (request.type) params.set('areaType', request.type);
      if (request.parentCode) params.set('parentCode', request.parentCode);
      params.set('pageNumber', String(request.page || 1));
      params.set('pageSize', String(request.all ? 1000 : 10));

      const paged = await apiRequest<{
        items: any[];
        totalCount: number;
        pageNumber: number;
        pageSize: number;
        totalPages: number;
      }>(`/areas?${params.toString()}`);

      const mappedAreas = paged.items.map(mapDtoToArea);
      mockStore.saveAreas(mappedAreas);

      let context: AreaListItem[] = [];
      if (request.all) {
        const itemCodes = new Set(paged.items.map((i: any) => i.areaCode || i.code));
        const stored = mockStore.getStoredAreas();
        const storedByCode = new Map(stored.map(a => [a.code, a]));
        const contextMap = new Map<string, AreaListItem>();

        for (const item of paged.items) {
          let pCode = item.parentAreaCode || null;
          if (!pCode && item.hierarchyPath) {
            const parts = item.hierarchyPath.split('/').filter(Boolean);
            if (parts.length > 1) pCode = parts[parts.length - 2];
          }
          const visited = new Set<string>();
          while (pCode && storedByCode.has(pCode) && !visited.has(pCode)) {
            visited.add(pCode);
            if (!itemCodes.has(pCode) && !contextMap.has(pCode)) {
              const parentArea = storedByCode.get(pCode)!;
              contextMap.set(pCode, {
                code: parentArea.code,
                name: parentArea.name,
                type: parentArea.type,
                parentCode: parentArea.parentCode,
                level: parentArea.level,
                areaSize: parentArea.areaSize,
                capacity: parentArea.capacity,
                capacityUnit: parentArea.capacityUnit,
                status: parentArea.status,
                childCount: 0,
              });
            }
            const parentObj = storedByCode.get(pCode);
            pCode = parentObj?.parentCode || null;
          }
        }
        context = Array.from(contextMap.values());
      }

      return {
        items: paged.items.map(mapDtoToListItem),
        context,
        total: paged.totalCount,
        page: paged.pageNumber,
        size: paged.pageSize,
      };
    } catch (error) {
      console.error('areasApi.search error:', error);
      if (error instanceof ApiError && (error.status === 401 || error.code === 'SESSION_ENDED')) {
        throw new AreaSearchError('SESSION_ENDED');
      }
      if (error instanceof ApiError && error.status === 403) {
        throw new AreaSearchError('FORBIDDEN');
      }

      // If we have stored areas from DB or seed tree, return them gracefully so UI does not break
      const stored = mockStore.getStoredAreas();
      const fallbackList = stored.length > 0 ? stored : mockGetAreaTree();
      if (fallbackList.length > 0) {
        const kw = (request.keyword || '').trim().toLowerCase();
        const matches = fallbackList
          .filter((a) => request.status === 'all' || a.status === request.status)
          .filter((a) => !request.type || a.type === request.type)
          .filter((a) => !request.parentCode || a.parentCode === request.parentCode)
          .filter((a) => !kw || a.name.toLowerCase().includes(kw) || a.code.toLowerCase().includes(kw));

        const page = request.page || 1;
        const size = request.all ? 1000 : 10;
        const pageItems = matches.slice((page - 1) * size, page * size);
        return {
          items: pageItems.map(a => ({
            code: a.code,
            name: a.name,
            type: a.type,
            parentCode: a.parentCode,
            level: a.level,
            areaSize: a.areaSize,
            capacity: a.capacity,
            capacityUnit: a.capacityUnit,
            status: a.status,
            childCount: 0,
          })),
          context: [],
          total: matches.length,
          page,
          size,
        };
      }
      return mockSearchAreas(request);
    }
  },

  /** UC-ARE-13: Nhóm thông tin liên kết (Bảng giá, Hợp đồng, Sản lượng). */
  async getRecords<G extends AreaRecordGroup>(
    userId: string,
    signedInAt: string,
    areaId: string,
    group: G,
    retry = false,
  ): Promise<AreaRecordData[G]> {
    if (!IS_MOCK_AUTH) {
      if (group === 'services') {
        try {
          const areaDto = await apiRequest<any>(`/areas/${encodeURIComponent(areaId)}`);
          const svcs: AreaService[] = Array.isArray(areaDto?.services)
            ? areaDto.services.map((s: any) => ({
                name: s.serviceName || s.name,
                group: s.group || 'Dịch vụ cảng',
                unit: s.unit || 'Lô',
                since: '2026-01-01',
              }))
            : [];
          return svcs as AreaRecordData[G];
        } catch {
          return [] as unknown as AreaRecordData[G];
        }
      }

      if (group === 'staff') {
        try {
          const areaDto = await apiRequest<any>(`/areas/${encodeURIComponent(areaId)}`);
          const staff: AreaStaff[] = Array.isArray(areaDto?.assignments)
            ? areaDto.assignments
                .filter((a: any) => !a.toDate || new Date(a.toDate) > new Date())
                .map((a: any) => ({
                  name: a.staffName || a.username || 'Cán bộ khai thác',
                  staffCode: a.username || a.staffCode || 'NV-KT',
                  since: a.fromDate ? String(a.fromDate).slice(0, 10) : '2026-01-01',
                  phone: '0903 000 111',
                }))
            : [];
          return staff as AreaRecordData[G];
        } catch {
          return [] as unknown as AreaRecordData[G];
        }
      }

      if (group === 'priceLists') {
        try {
          const res = await apiRequest<any[]>(`/areas/${encodeURIComponent(areaId)}/price-lists`);
          const priceLists: AreaPriceList[] = Array.isArray(res)
            ? res.map((p: any) => ({
                code: p.code,
                customer: p.customer,
                contract: p.contract,
                services: p.services,
                from: p.from,
                to: p.to,
                status: p.status === 'approved' ? 'approved' : 'active',
              }))
            : [];
          return priceLists as AreaRecordData[G];
        } catch {
          return [] as unknown as AreaRecordData[G];
        }
      }

      if (group === 'contracts') {
        try {
          const res = await apiRequest<any>(`/areas/${encodeURIComponent(areaId)}/contracts`);
          const contractsData: AreaRecordData['contracts'] = {
            items: Array.isArray(res?.items)
              ? res.items.map((c: any) => ({
                  code: c.code,
                  customer: c.customer,
                  from: c.from,
                  to: c.to,
                  volume: Number(c.volume || 0),
                  volumeUnit: (c.volumeUnit || 'container') as any,
                }))
              : [],
            output: res?.output
              ? {
                  period: res.output.period || '10/2026',
                  lifts: Number(res.output.lifts || 0),
                  storageTeuDays: Number(res.output.storageTeuDays || 0),
                  periods: Number(res.output.periods || 1),
                }
              : null,
          };
          return contractsData as AreaRecordData[G];
        } catch {
          return { items: [], output: null } as unknown as AreaRecordData[G];
        }
      }
    }

    return mockGetAreaRecords(userId, signedInAt, areaId, group, retry);
  },

  /** 13.11: Ghi nhật ký xuất file lý lịch. */
  recordExport(userId: string, signedInAt: string, code: string, sections: string[]): string {
    return mockRecordAreaExport(userId, signedInAt, code, sections);
  },

  /** Phân công nhân sự phụ trách khu vực. */
  async assignStaff(request: AssignStaffRequest): Promise<AreaStaff> {
    try {
      const payload = {
        staffCode: request.staffCode,
        fromDate: request.since ? new Date(request.since).toISOString() : new Date().toISOString(),
      };

      const res = await apiRequest<any>(`/areas/${encodeURIComponent(request.code)}/assignments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const person: AreaStaff = {
        name: res.staffName || request.staffCode,
        staffCode: res.username || request.staffCode,
        since: request.since,
        phone: '0903 000 111',
      };

      return person;
    } catch (error) {
      if (!IS_MOCK_AUTH) throw error;
      return mockAssignAreaStaff(request);
    }
  },

  /** Kết thúc phân công nhân viên khỏi khu vực. */
  async endStaff(request: EndStaffRequest): Promise<void> {
    try {
      await apiRequest<void>(`/areas/${encodeURIComponent(request.code)}/assignments/${encodeURIComponent(request.staffCode)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!IS_MOCK_AUTH) throw error;
      mockEndAreaStaff(request);
    }
  },

  /** Cập nhật danh mục dịch vụ được phép cung cấp tại khu vực. */
  async setServices(request: SetServicesRequest): Promise<void> {
    try {
      const payload = {
        serviceNames: request.serviceNames,
      };

      await apiRequest<any>(`/areas/${encodeURIComponent(request.code)}/services`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!IS_MOCK_AUTH) throw error;
      mockSetAreaServices(request);
    }
  },

  /** Tạm ngưng hoặc mở lại hoạt động khu vực. */
  async changeStatus(request: ChangeAreaStatusRequest): Promise<Area> {
    try {
      const payload = {
        status: request.status === 'active' ? 'Active' : 'Suspended',
        reason: request.reason || null,
        rowVersion: request.baseVersion ?? 1,
      };

      const res = await apiRequest<any>(`/areas/${encodeURIComponent(request.code)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const updated = mapDtoToArea(res);
      if (!updated.history || updated.history.length === 0) {
        const prev = mockGetArea(request.code);
        const prevHistory = prev?.history || [];
        updated.history = [
          ...prevHistory,
          {
            kind: 'status',
            action: request.status === 'suspended' ? 'Tạm ngưng khu vực' : 'Mở lại hoạt động',
            by: 'Trưởng phòng Khai thác',
            byTitle: 'Trưởng phòng Khai thác',
            at: new Date().toISOString(),
            version: updated.version,
            detail: request.status === 'suspended' ? `Chuyển Hoạt động → Tạm ngưng (phiên bản ${updated.version})` : `Chuyển Tạm ngưng → Hoạt động (phiên bản ${updated.version})`,
            reason: request.reason || '',
          },
        ];
      }
      mockStore.saveAreas([updated]);
      return updated;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) throw new AreaOperationError('CONFLICT');
        if (error.status === 403) throw new AreaOperationError('FORBIDDEN');
        if (error.status === 404) throw new AreaOperationError('NOT_FOUND');
        if (error.status === 401 || error.code === 'SESSION_ENDED') throw new AreaOperationError('SESSION_ENDED');
      }
      if (!IS_MOCK_AUTH) throw error;
      return mockChangeAreaStatus(request);
    }
  },

  /** Danh mục nhân viên Khai thác và dịch vụ cảng cho các hộp thoại thao tác. */
  getOperationCatalogs(): { staff: StaffOption[]; services: ServiceOption[] } {
    if (_cachedCatalogs) return _cachedCatalogs;
    if (IS_MOCK_AUTH) return mockGetAreaOperationCatalogs();
    return { staff: [], services: [] };
  },

  /** Tải danh mục dịch vụ và nhân sự động từ Backend API (GET /api/v1/areas/operation-catalogs). */
  async getOperationCatalogsAsync(): Promise<{ staff: StaffOption[]; services: ServiceOption[] }> {
    try {
      const res = await apiRequest<{
        services: Array<{ serviceId: string; name: string; group: string; unit: string }>;
        staff: Array<{ userId: string; name: string; staffCode: string; phone: string; defaultTitle: string }>;
      }>('/areas/operation-catalogs');
      if (res && res.services && res.staff) {
        _cachedCatalogs = res;
        return res;
      }
    } catch {
      // Fallback về mock catalog nếu chưa kết nối hoặc phiên chưa sẵn sàng
    }
    return IS_MOCK_AUTH ? mockGetAreaOperationCatalogs() : (_cachedCatalogs || { staff: [], services: [] });
  },

  /** Lấy chi tiết thông tin khu vực theo mã (đồng bộ từ bộ nhớ). */
  getArea(code: string): Area | undefined {
    return mockGetArea(code);
  },

  /** Tải thông tin chi tiết khu vực từ Backend API. */
  async fetchAreaAsync(code: string): Promise<Area | null> {
    try {
      const res = await apiRequest<any>(`/areas/${encodeURIComponent(code)}`);
      const area = mapDtoToArea(res);
      mockStore.saveAreas([area]);
      return area;
    } catch {
      return mockGetArea(code) || null;
    }
  },

  /** Tham chiếu trong bảng giá, hợp đồng, sản lượng – quyết định khóa mã. */
  getReferences(areaId: string): AreaReferences {
    return mockGetAreaReferences(areaId);
  },

  /** Sơ đồ phân cấp mặt bằng cảng hiện hành. */
  getTree(): Area[] {
    const stored = mockStore.getStoredAreas();
    if (stored.length > 0) return stored;
    return mockGetAreaTree();
  },

  /** Tải cây phân cấp động từ Backend API. */
  async fetchTreeAsync(): Promise<Area[]> {
    try {
      const paged = await apiRequest<{ items: any[] }>('/areas?pageSize=1000');
      if (paged && paged.items) {
        const mapped = paged.items.map(mapDtoToArea);
        mockStore.saveAreas(mapped);
        return mapped;
      }
    } catch {
      // Giữ cây hiện tại
    }
    const stored = mockStore.getStoredAreas();
    if (stored.length > 0) return stored;
    return mockGetAreaTree();
  },

  /** Tải số liệu tổng hợp khu vực cho Bảng điều khiển từ Backend API (GET /api/v1/areas/dashboard). */
  async fetchDashboardAsync(): Promise<AreaDashboardDto | null> {
    try {
      const res = await apiRequest<AreaDashboardDto>('/areas/dashboard');
      if (res && typeof res.totalAreas === 'number') {
        _lastDashboard = res;
        return res;
      }
    } catch (err) {
      console.error('[areasApi] fetchDashboardAsync error:', err);
      // Giữ fallback về dữ liệu cached gần nhất khi API chưa sẵn sàng hoặc gián đoạn
    }
    return _lastDashboard;
  },
  getCachedDashboard(): AreaDashboardDto | null {
    return _lastDashboard;
  },
};

let _lastDashboard: AreaDashboardDto | null = null;

export interface AreaDashboardDto {
  totalAreas: number;
  activeCount: number;
  suspendedCount: number;
  level1Count: number;
  level1Names: string[];
  level2Count: number;
  level3Count: number;
  incompleteCount: number;
  recentAreas: any[];
  areaTree: any[];
}
