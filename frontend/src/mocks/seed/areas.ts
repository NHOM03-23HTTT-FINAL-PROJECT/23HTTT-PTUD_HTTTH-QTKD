import type { Area, AreaHistoryEntry, AreaLevel, AreaStatus, AreaTypeCode, CapacityUnit } from '@/features/areas/types/area';

/*
 * Sơ đồ mặt bằng mẫu theo page "03 · Khu vực (ARE)" trên Figma: 4 khu vực Cấp 1, các bãi/kho/cầu bến Cấp 2
 * và phân khu/Block Cấp 3. KV-CL-B1 mang đủ lịch sử tới phiên bản 7 như frame 04.1 / 13.7.
 */

type SeedRow = [
  code: string,
  name: string,
  type: AreaTypeCode,
  parentCode: string | null,
  areaSize: number | null,
  capacity: number | null,
  capacityUnit: CapacityUnit,
  gps: string,
  standards: string,
  status?: AreaStatus,
];

const ROWS: SeedRow[] = [
  ['KV-CL', 'Cảng Cát Lái', 'CANG', null, 1_200_000, 4_500_000, 'TEU', '10.76220, 106.78660', 'Cảng container chính; luồng tàu sâu -12m, 6 cầu bến, hệ thống TOS quản lý vị trí container.'],
  ['KV-CL-B1', 'Bãi container B1', 'BAI_CY', 'KV-CL', 85_000, 12_000, 'TEU', '10.76540, 106.78812', 'Bãi container hàng khô, nền bê tông chịu tải 30 tấn/m²; xếp tối đa 6 tầng; 6 cầu khung RTG.'],
  ['KV-CL-B1-A1', 'Block A1', 'BAI_CY', 'KV-CL-B1', 12_000, 1_700, 'TEU', '10.76531, 106.78790', 'Block hàng khô 20/40 feet; xếp tối đa 5 tầng container rỗng.'],
  ['KV-CL-B1-A2', 'Block A2', 'BAI_CY', 'KV-CL-B1', 12_500, 1_800, 'TEU', '10.76552, 106.78834', 'Block hàng khô; 60 ổ cắm điện cho container lạnh.'],
  ['KV-CL-B2', 'Bãi container B2', 'BAI_CY', 'KV-CL', 40_000, 5_200, 'TEU', '10.76102, 106.78811', 'Bãi container hàng nhập; khu kiểm hóa tập trung. Đang gia cố nền.', 'suspended'],
  ['KV-CL-C1', 'Kho CFS C1', 'KHO_CFS', 'KV-CL', 18_000, 25_000, 'Tấn', '10.81942, 106.79235', 'Kho khai thác hàng lẻ; 12 cửa nhập xuất, sàn chịu tải 3 tấn/m².'],
  ['KV-CL-C1-K1', 'Kho lạnh K1', 'KHO_CFS', 'KV-CL-C1', 4_000, 6_000, 'Tấn', '10.81950, 106.79241', 'Nhiệt độ -25°C đến +5°C; máy phát dự phòng 500 kVA.'],
  ['KV-CL-C1-K2', 'Khu hàng lẻ K2', 'KHO_CFS', 'KV-CL-C1', 6_500, 9_000, 'Tấn', '10.81938, 106.79250', 'Khu đóng rút hàng lẻ; kệ 4 tầng.'],
  ['KV-CL-CB3', 'Cầu bến số 3', 'CAU_BEN', 'KV-CL', 9_600, 120_000, 'Tấn', '10.76330, 106.78590', 'Cầu bến dài 240m; tiếp nhận tàu tới 30.000 DWT; 2 cẩu bờ STS.'],
  ['KV-CL-CB4', 'Cầu bến số 4', 'CAU_BEN', 'KV-CL', 9_600, 120_000, 'Tấn', '10.76390, 106.78540', 'Cầu bến dài 240m; 2 cẩu bờ STS.'],
  ['KV-CL-P2', 'Bãi phụ P2', 'BAI_PHU', 'KV-CL', 6_000, 800, 'TEU', '10.76050, 106.78900', 'Bãi phụ đang cải tạo nền, tạm dừng tiếp nhận container.', 'suspended'],
  ['KV-PL', 'ICD Phước Long', 'CANG', null, 400_000, 150_000, 'TEU', '10.81520, 106.77010', 'Cụm ICD nối cảng Cát Lái bằng sà lan; 3 cổng kiểm soát.'],
  ['KV-PL-B1', 'Bãi container ICD Phước Long', 'BAI_CY', 'KV-PL', 60_000, 8_500, 'TEU', '10.81560, 106.77080', 'Bãi container hàng; xếp tối đa 6 tầng.'],
  ['KV-PL-B2', 'Bãi container rỗng Phước Long', 'BAI_CY', 'KV-PL', 35_000, 4_000, 'TEU', '10.81580, 106.77105', 'Bãi container rỗng hãng tàu.'],
  ['KV-PL-CFS', 'Kho CFS Phước Long', 'KHO_CFS', 'KV-PL', 15_000, 18_000, 'Tấn', '10.81490, 106.76980', 'Kho hàng lẻ xuất khẩu; khu kiểm hóa hải quan.'],
  ['KV-HP', 'Cảng Hiệp Phước', 'CANG', null, 650_000, 1_200_000, 'TEU', '10.62880, 106.75480', 'Cảng tổng hợp; luồng Soài Rạp, tiếp nhận tàu 50.000 DWT.'],
  ['KV-HP-CB1', 'Cầu bến số 1', 'CAU_BEN', 'KV-HP', 12_000, 150_000, 'Tấn', '10.62910, 106.75420', 'Cầu bến dài 300m; 3 cẩu bờ.'],
  ['KV-HP-CB2', 'Cầu bến số 2', 'CAU_BEN', 'KV-HP', 12_000, 150_000, 'Tấn', '10.62950, 106.75510', 'Cầu bến dài 300m; ưu tiên hàng rời.'],
  ['KV-HP-Y1', 'Bãi container Y1', 'BAI_CY', 'KV-HP', 90_000, 14_000, 'TEU', '10.62810, 106.75530', 'Bãi container tổng hợp; 8 cẩu khung RTG.'],
  ['KV-HP-Y1-R1', 'Khu reefer R1', 'BAI_CY', 'KV-HP-Y1', 6_000, 900, 'TEU', '10.62802, 106.75541', '240 ổ cắm điện cho container lạnh.'],
  ['KV-HP-Y1-R2', 'Khu reefer R2', 'BAI_CY', 'KV-HP-Y1', 5_500, 800, 'TEU', '10.62795, 106.75562', '200 ổ cắm điện cho container lạnh.'],
  ['KV-TV', 'ICD Tân Vạn', 'CANG', null, 300_000, 90_000, 'TEU', '10.90420, 106.82360', 'ICD nội địa; kết nối đường sắt Bắc – Nam.'],
  ['KV-TV-B1', 'Bãi container chính', 'BAI_CY', 'KV-TV', 50_000, 7_000, 'TEU', '10.90460, 106.82410', 'Bãi container hàng nội địa.'],
  ['KV-TV-K1', 'Kho ngoại quan K1', 'KHO_CFS', 'KV-TV', 8_000, 9_000, 'Tấn', '10.90390, 106.82300', 'Kho ngoại quan tạm dừng khai thác chờ gia hạn giấy phép.', 'suspended'],
];

const SEED_CREATED_AT = '2025-03-12T08:15:00+07:00';
const SON = { by: 'Võ Thanh Sơn', byTitle: 'Trưởng phòng Khai thác' };
const TAM = { by: 'Lê Minh Tâm', byTitle: 'Nhân viên Khai thác' };

const CREATED: AreaHistoryEntry = {
  kind: 'create',
  action: 'Tạo mới khu vực',
  ...SON,
  at: SEED_CREATED_AT,
  version: 1,
  detail: 'Khởi tạo với 9 thông số ban đầu, trạng thái Hoạt động.',
};

/** Lịch sử biến động của Bãi container B1 (13.7), phiên bản 7 lúc 21/10/2026 15:20 (04.1). */
const B1_HISTORY: AreaHistoryEntry[] = [
  CREATED,
  { kind: 'assignment', action: 'Phân công nhân sự', ...SON, at: '2025-04-01T08:00:00+07:00', version: 1, detail: 'Phân công Trần Quốc Huy (Ca 1), Phạm Thị Lan (Ca 2) phụ trách bãi.' },
  {
    kind: 'update',
    action: 'Cập nhật thông tin',
    ...SON,
    at: '2025-05-20T14:30:00+07:00',
    version: 2,
    detail: 'Mô tả quy chuẩn: bổ sung tải trọng nền 30 tấn/m².',
    changes: [{ field: 'standards', before: 'Nền bê tông chịu tải 25 tấn/m²', after: 'Nền bê tông chịu tải 30 tấn/m²' }],
    reason: 'Hoàn tất gia cố nền theo nghiệm thu 05/2025.',
  },
  { kind: 'assignment', action: 'Phân công nhân sự', ...SON, at: '2025-07-15T09:00:00+07:00', version: 2, detail: 'Phân công Đỗ Minh Khoa (Ca 3) phụ trách bãi.' },
  {
    kind: 'update',
    action: 'Cập nhật thông tin',
    ...TAM,
    at: '2025-08-11T10:20:00+07:00',
    version: 3,
    detail: 'Sức chứa 11.000 → 12.000 TEU.',
    changes: [{ field: 'capacity', before: '11.000 TEU', after: '12.000 TEU' }],
    reason: 'Bổ sung 1 cẩu khung RTG.',
  },
  {
    kind: 'update',
    action: 'Cập nhật thông tin',
    ...SON,
    at: '2026-01-10T16:00:00+07:00',
    version: 4,
    detail: 'Diện tích 82.000 → 85.000 m².',
    changes: [{ field: 'areaSize', before: '82.000 m²', after: '85.000 m²' }],
    reason: 'Bổ sung khu đệm phía Nam.',
  },
  { kind: 'status', action: 'Tạm ngưng khu vực', ...SON, at: '2026-06-15T18:00:00+07:00', version: 5, detail: 'Hoạt động → Tạm ngưng. Duy tu nền bãi khu A (15/06 – 30/06/2026).' },
  { kind: 'status', action: 'Mở lại hoạt động', ...SON, at: '2026-06-30T07:00:00+07:00', version: 6, detail: 'Tạm ngưng → Hoạt động. Hoàn tất duy tu nền bãi khu A.' },
  { kind: 'assignment', action: 'Gán dịch vụ', ...SON, at: '2026-09-02T09:10:00+07:00', version: 6, detail: 'Thêm "Vệ sinh container" vào danh mục dịch vụ được phép.' },
  {
    kind: 'update',
    action: 'Cập nhật thông tin',
    ...TAM,
    at: '2026-10-21T15:20:00+07:00',
    version: 7,
    detail: 'Tọa độ GPS 10.76538, 106.78809 → 10.76540, 106.78812.',
    changes: [{ field: 'gps', before: '10.76538, 106.78809', after: '10.76540, 106.78812' }],
    reason: 'Đo đạc lại ranh giới bãi.',
  },
];

function suspendedHistory(detail: string): AreaHistoryEntry[] {
  return [CREATED, { kind: 'status', action: 'Tạm ngưng khu vực', ...SON, at: '2026-08-01T08:00:00+07:00', version: 2, detail }];
}

const HISTORY_OVERRIDES: Record<string, AreaHistoryEntry[]> = {
  'KV-CL-B1': B1_HISTORY,
  'KV-CL-B2': suspendedHistory('Hoạt động → Tạm ngưng. Gia cố nền bãi hàng nhập.'),
  'KV-CL-P2': suspendedHistory('Hoạt động → Tạm ngưng. Cải tạo nền bãi phụ.'),
  'KV-TV-K1': suspendedHistory('Hoạt động → Tạm ngưng. Chờ gia hạn giấy phép kho ngoại quan.'),
};

/** AreaId cố định theo mã ban đầu, để dữ liệu liên kết không mất khi đổi mã (04.8). */
export function seedAreaId(code: string): string {
  return `area-${code.toLowerCase()}`;
}

function buildSeed(): Area[] {
  const byCode = new Map<string, Area>();
  return ROWS.map(([code, name, type, parentCode, areaSize, capacity, capacityUnit, gps, standards, status = 'active']) => {
    const parent = parentCode ? byCode.get(parentCode)! : null;
    const history = HISTORY_OVERRIDES[code] ?? [CREATED];
    const area: Area = {
      id: seedAreaId(code),
      code,
      name,
      type,
      parentCode,
      level: (parent ? parent.level + 1 : 1) as AreaLevel,
      path: `${parent ? parent.path : ''}/${code}`,
      gps,
      areaSize,
      capacity,
      capacityUnit,
      standards,
      status,
      version: history[history.length - 1].version,
      createdAt: SEED_CREATED_AT,
      createdBy: SON.by,
      createdByTitle: SON.byTitle,
      history,
    };
    byCode.set(code, area);
    return area;
  });
}

export const SEED_AREAS: Area[] = buildSeed();

/** Mã khu vực bắt đầu bằng tiền tố này gặp lỗi kết nối CSDL ở lần lưu đầu (frame 01.5). */
export const SIMULATED_AREA_SAVE_ERROR_PREFIX = 'KV-LOI';

/** Số thứ tự bắt đầu của mã hệ thống tự cấp, để mã đầu tiên là KV-000128 như frame 01.6. */
export const AREA_CODE_SEQUENCE_START = 127;

/** 04.5: lần lưu đầu trên khu vực này gặp bản do Lê Minh Tâm vừa lưu trước. */
export const SIMULATED_AREA_CONFLICT = {
  code: 'KV-CL-B2',
  by: TAM.by,
  byTitle: TAM.byTitle,
  areaSize: 42_000,
  gps: '10.76110, 106.78826',
  reason: 'Đo đạc lại sau gia cố nền.',
};

/** 04.4: khu vực chưa có tham chiếu lúc mở biểu mẫu, nhưng hợp đồng được ký ngay trước khi lưu đổi mã. */
export const SIMULATED_AREA_LATE_REFERENCE_CODE = 'KV-HP-CB2';

/** Từ khóa giả lập lỗi tải danh sách ở lần tra cứu đầu (12.5); "Tải lại trang" sẽ thành công. */
export const SIMULATED_AREA_SEARCH_FAILURE_KEYWORD = 'mat ket noi';
