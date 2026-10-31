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
import type {
  Area,
  AreaStaff,
  AssignStaffRequest,
  ChangeAreaStatusRequest,
  EndStaffRequest,
  SetServicesRequest,
  AreaRecordData,
  AreaRecordGroup,
  AreaReferences,
  AreaSearchRequest,
  AreaSearchResult,
  ChangeAreaParentRequest,
  ChangeAreaParentResult,
  CreateAreaRequest,
  CreateAreaResult,
  UpdateAreaRequest,
  UpdateAreaResult,
} from '../types/area';

/** Độ trễ giả lập để thấy trạng thái "Đang lưu…" / "Đang tải…". */
const MOCK_LATENCY_MS = 900;
const MOCK_SEARCH_LATENCY_MS = 300;
const MOCK_RECORDS_LATENCY_MS = 450;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API của feature areas. Prototype gọi server giả lập trong `src/mocks`;
 * khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP (gửi kèm header Idempotency-Key), giữ nguyên chữ ký.
 */
export const areasApi = {
  /** UC-ARE-01: tạo mới khu vực khai thác. */
  async create(request: CreateAreaRequest): Promise<CreateAreaResult> {
    await delay(MOCK_LATENCY_MS);
    return mockCreateArea(request);
  },

  /** UC-ARE-04: cập nhật thông tin và quy chuẩn kỹ thuật trên đúng phiên bản đang sửa. */
  async update(request: UpdateAreaRequest): Promise<UpdateAreaResult> {
    await delay(MOCK_LATENCY_MS);
    return mockUpdateArea(request);
  },

  /** UC-ARE-02 (ngữ cảnh chỉnh sửa): đổi khu vực cấp cha và đồng bộ đường dẫn phân khu con. */
  async changeParent(request: ChangeAreaParentRequest): Promise<ChangeAreaParentResult> {
    await delay(MOCK_LATENCY_MS);
    return mockChangeAreaParent(request);
  },

  /** UC-ARE-12: tra cứu khu vực (bảng có phân trang hoặc toàn bộ cho sơ đồ cây). */
  async search(request: AreaSearchRequest): Promise<AreaSearchResult> {
    await delay(MOCK_SEARCH_LATENCY_MS);
    return mockSearchAreas(request);
  },

  /** UC-ARE-13: một nhóm thông tin liên kết; mỗi nhóm tải và báo lỗi riêng (13.8). */
  async getRecords<G extends AreaRecordGroup>(
    userId: string,
    signedInAt: string,
    areaId: string,
    group: G,
    retry = false,
  ): Promise<AreaRecordData[G]> {
    await delay(MOCK_RECORDS_LATENCY_MS);
    return mockGetAreaRecords(userId, signedInAt, areaId, group, retry);
  },

  /** 13.11: ghi nhật ký xuất file lý lịch, trả về tên người xuất để in trên tệp. */
  recordExport(userId: string, signedInAt: string, code: string, sections: string[]): string {
    return mockRecordAreaExport(userId, signedInAt, code, sections);
  },

  /** Phân công nhân sự phụ trách khu vực (chỉ Trưởng phòng Khai thác). */
  async assignStaff(request: AssignStaffRequest): Promise<AreaStaff> {
    await delay(MOCK_LATENCY_MS);
    return mockAssignAreaStaff(request);
  },

  /** Kết thúc phân công một nhân viên khỏi khu vực. */
  async endStaff(request: EndStaffRequest): Promise<void> {
    await delay(MOCK_LATENCY_MS);
    mockEndAreaStaff(request);
  },

  /** Cập nhật danh mục dịch vụ được phép cung cấp tại khu vực. */
  async setServices(request: SetServicesRequest): Promise<void> {
    await delay(MOCK_LATENCY_MS);
    mockSetAreaServices(request);
  },

  /** Tạm ngưng hoặc mở lại hoạt động khu vực. */
  async changeStatus(request: ChangeAreaStatusRequest): Promise<Area> {
    await delay(MOCK_LATENCY_MS);
    return mockChangeAreaStatus(request);
  },

  /** Danh mục nhân viên Khai thác và dịch vụ cảng cho các hộp thoại thao tác. */
  getOperationCatalogs() {
    return mockGetAreaOperationCatalogs();
  },

  getArea(code: string): Area | undefined {
    return mockGetArea(code);
  },

  /** Tham chiếu trong bảng giá, hợp đồng, sản lượng – quyết định khóa mã (ARE-07, bước 2 của UC-ARE-04). */
  getReferences(areaId: string): AreaReferences {
    return mockGetAreaReferences(areaId);
  },

  /** Sơ đồ phân cấp mặt bằng cảng hiện hành, theo thứ tự phân cấp. */
  getTree(): Area[] {
    return mockGetAreaTree();
  },
};
