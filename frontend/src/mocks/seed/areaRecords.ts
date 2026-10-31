import type { AreaContract, AreaOutput, AreaPriceList, AreaService, AreaStaff, ServiceOption, StaffOption } from '@/features/areas/types/area';
import { seedAreaId } from './areas';

/*
 * Thông tin liên kết của khu vực (UC-ARE-13, tab 2–5) theo frame 13.3 → 13.6. Bảng giá, hợp đồng, sản lượng thuộc
 * module khác; ở prototype chỉ là bản tóm tắt theo khu vực. Khu vực không có trong bảng này chưa phát sinh tham chiếu,
 * nên được phép sửa mã (04.8).
 */

type AreaRecordSeed = {
  services: AreaService[];
  staff: AreaStaff[];
  priceLists: AreaPriceList[];
  contracts: AreaContract[];
  output: AreaOutput | null;
};

const CONTAINER_SERVICES: AreaService[] = [
  { name: 'Nâng hạ container hàng', group: 'Bốc xếp', unit: 'Container', since: '2025-03-12' },
  { name: 'Nâng hạ container rỗng', group: 'Bốc xếp', unit: 'Container', since: '2025-03-12' },
  { name: 'Lưu bãi container hàng khô', group: 'Lưu bãi', unit: 'TEU-ngày', since: '2025-03-12' },
  { name: 'Lưu bãi container rỗng', group: 'Lưu bãi', unit: 'TEU-ngày', since: '2025-03-12' },
];

const CFS_SERVICES: AreaService[] = [
  { name: 'Đóng rút hàng lẻ', group: 'Kho CFS', unit: 'Tấn', since: '2025-03-12' },
  { name: 'Lưu kho hàng lẻ', group: 'Kho CFS', unit: 'Tấn-ngày', since: '2025-03-12' },
  { name: 'Kiểm đếm hàng hóa', group: 'Dịch vụ hỗ trợ', unit: 'Lô', since: '2025-06-01' },
];

const RECORDS: Record<string, AreaRecordSeed> = {
  'KV-CL': {
    services: [
      ...CONTAINER_SERVICES,
      { name: 'Xếp dỡ tàu container', group: 'Bốc xếp', unit: 'Container', since: '2025-03-12' },
      { name: 'Cung cấp điện container lạnh', group: 'Dịch vụ hỗ trợ', unit: 'Container-ngày', since: '2025-03-12' },
    ],
    staff: [
      { name: 'Võ Thanh Sơn', staffCode: 'NV-KT-0001', title: 'Trưởng phòng Khai thác', shift: 'Hành chính · 08:00 – 17:00', since: '2025-03-12', phone: '0903 000 111' },
      { name: 'Lê Minh Tâm', staffCode: 'NV-KT-0086', title: 'Điều độ cảng', shift: 'Ca 1 · 06:00 – 14:00', since: '2025-03-12', phone: '0938 220 145' },
    ],
    priceLists: [
      { code: 'BG-2026-002', customer: 'Công ty TNHH Minh Phát', contract: 'HD-2026-013', services: 'Xếp dỡ tàu container', from: '2026-01-01', to: '2026-12-31', status: 'active' },
      { code: 'BG-2026-009', customer: 'Hãng tàu Đông Á', contract: 'HD-2025-088', services: 'Xếp dỡ tàu, điện container lạnh', from: '2026-02-01', to: '2027-01-31', status: 'active' },
    ],
    contracts: [
      { code: 'HD-2026-013', customer: 'Công ty TNHH Minh Phát', from: '2026-01-01', to: '2026-12-31', volume: 5_210, volumeUnit: 'container' },
      { code: 'HD-2025-088', customer: 'Hãng tàu Đông Á', from: '2025-04-01', to: '2027-03-31', volume: 7_640, volumeUnit: 'container' },
      { code: 'HD-2026-030', customer: 'Công ty CP Sao Biển', from: '2026-03-01', to: '2027-02-28', volume: 2_300, volumeUnit: 'container' },
    ],
    output: { period: '09/2026', lifts: 41_800, storageTeuDays: 288_000, periods: 18 },
  },
  'KV-CL-B1': {
    services: [...CONTAINER_SERVICES, { name: 'Vệ sinh container', group: 'Dịch vụ hỗ trợ', unit: 'Container', since: '2026-09-02' }],
    staff: [
      { name: 'Trần Quốc Huy', staffCode: 'NV-KT-0112', title: 'Trưởng ca bãi', shift: 'Ca 1 · 06:00 – 14:00', since: '2025-04-01', phone: '0903 112 845' },
      { name: 'Phạm Thị Lan', staffCode: 'NV-KT-0127', title: 'Điều độ bãi', shift: 'Ca 2 · 14:00 – 22:00', since: '2025-04-01', phone: '0918 334 201' },
      { name: 'Đỗ Minh Khoa', staffCode: 'NV-KT-0140', title: 'Điều độ bãi', shift: 'Ca 3 · 22:00 – 06:00', since: '2025-07-15', phone: '0937 556 019' },
      { name: 'Nguyễn Hữu Phước', staffCode: 'NV-KT-0098', title: 'Giám sát an toàn', shift: 'Hành chính · 08:00 – 17:00', since: '2025-03-12', phone: '0909 778 230' },
    ],
    priceLists: [
      { code: 'BG-2025-040', customer: 'Công ty TNHH Minh Phát', contract: 'HD-2026-013', services: 'Lưu bãi, nâng hạ container hàng', from: '2026-01-01', to: '2026-12-31', status: 'active' },
      { code: 'BG-2026-011', customer: 'Công ty CP Hưng Thịnh Logistics', contract: 'HD-2026-021', services: 'Nâng hạ container hàng, rỗng', from: '2026-02-15', to: '2026-11-14', status: 'active' },
      { code: 'BG-2026-018', customer: 'Hãng tàu Đông Á', contract: 'HD-2025-088', services: 'Lưu bãi container rỗng', from: '2026-04-01', to: '2027-03-31', status: 'active' },
      { code: 'BG-2026-025', customer: 'Công ty TNHH Minh Phát', contract: 'HD-2026-013 · Phụ lục 01', services: 'Vệ sinh container', from: '2026-11-01', to: '2026-12-31', status: 'approved' },
    ],
    contracts: [
      { code: 'HD-2026-013', customer: 'Công ty TNHH Minh Phát', from: '2026-01-01', to: '2026-12-31', volume: 1_940, volumeUnit: 'container' },
      { code: 'HD-2026-021', customer: 'Công ty CP Hưng Thịnh Logistics', from: '2026-02-15', to: '2026-11-14', volume: 1_210, volumeUnit: 'container' },
      { code: 'HD-2025-088', customer: 'Hãng tàu Đông Á', from: '2025-04-01', to: '2027-03-31', volume: 14_800, volumeUnit: 'TEU-ngày' },
      { code: 'HD-2026-027', customer: 'Công ty TNHH Vận tải Nam Sơn', from: '2026-03-01', to: '2027-02-28', volume: 860, volumeUnit: 'container' },
      { code: 'HD-2026-034', customer: 'Công ty CP Sao Biển', from: '2026-05-01', to: '2027-04-30', volume: 640, volumeUnit: 'container' },
      { code: 'HD-2026-041', customer: 'Công ty TNHH Thương mại Phú Gia', from: '2026-07-01', to: '2027-06-30', volume: 310, volumeUnit: 'container' },
    ],
    output: { period: '09/2026', lifts: 8_420, storageTeuDays: 61_300, periods: 12 },
  },
  'KV-CL-C1': {
    services: CFS_SERVICES,
    staff: [
      { name: 'Hoàng Thị Mai', staffCode: 'NV-KT-0131', title: 'Thủ kho CFS', shift: 'Ca 1 · 06:00 – 14:00', since: '2025-03-12', phone: '0912 450 337' },
      { name: 'Bùi Văn Lộc', staffCode: 'NV-KT-0145', title: 'Kiểm đếm viên', shift: 'Ca 2 · 14:00 – 22:00', since: '2025-09-01', phone: '0976 118 902' },
    ],
    priceLists: [
      { code: 'BG-2026-014', customer: 'Công ty CP Hưng Thịnh Logistics', contract: 'HD-2026-021', services: 'Đóng rút, lưu kho hàng lẻ', from: '2026-02-15', to: '2026-11-14', status: 'active' },
    ],
    contracts: [{ code: 'HD-2026-021', customer: 'Công ty CP Hưng Thịnh Logistics', from: '2026-02-15', to: '2026-11-14', volume: 2_150, volumeUnit: 'container' }],
    output: { period: '09/2026', lifts: 2_150, storageTeuDays: 0, periods: 9 },
  },
  'KV-HP-Y1': {
    services: CONTAINER_SERVICES.slice(0, 3),
    staff: [
      { name: 'Ngô Đức Thành', staffCode: 'NV-KT-0151', title: 'Trưởng ca bãi', shift: 'Ca 1 · 06:00 – 14:00', since: '2025-06-01', phone: '0905 667 120' },
    ],
    priceLists: [
      { code: 'BG-2026-020', customer: 'Hãng tàu Đông Á', contract: 'HD-2025-088', services: 'Nâng hạ, lưu bãi container hàng', from: '2026-03-01', to: '2027-02-28', status: 'active' },
      { code: 'BG-2026-029', customer: 'Công ty CP Sao Biển', contract: 'HD-2026-030', services: 'Lưu bãi container lạnh', from: '2026-12-01', to: '2027-11-30', status: 'approved' },
    ],
    contracts: [{ code: 'HD-2025-088', customer: 'Hãng tàu Đông Á', from: '2025-04-01', to: '2027-03-31', volume: 3_380, volumeUnit: 'container' }],
    output: { period: '09/2026', lifts: 3_380, storageTeuDays: 24_100, periods: 7 },
  },
  'KV-PL-B1': {
    services: CONTAINER_SERVICES.slice(0, 2),
    staff: [
      { name: 'Trịnh Văn Hải', staffCode: 'NV-KT-0160', title: 'Điều độ bãi', shift: 'Ca 1 · 06:00 – 14:00', since: '2025-08-01', phone: '0938 004 512' },
    ],
    priceLists: [],
    contracts: [],
    output: null,
  },
};

/** Dữ liệu liên kết theo AreaId; khu vực chưa có dữ liệu trả về danh sách rỗng. */
export const SEED_AREA_RECORDS: Record<string, AreaRecordSeed> = Object.fromEntries(
  Object.entries(RECORDS).map(([code, records]) => [seedAreaId(code), records]),
);

export const EMPTY_AREA_RECORDS: AreaRecordSeed = { services: [], staff: [], priceLists: [], contracts: [], output: null };

/** Module Bảng giá lỗi truy vấn ở lần tải đầu của khu vực này (13.8). */
export const SIMULATED_PRICE_LIST_FAILURE_AREA = seedAreaId('KV-HP-Y1');

/** 04.4: hợp đồng ký muộn với khu vực này sau khi biểu mẫu sửa mã đã mở. */
export const LATE_REFERENCE_CONTRACT: AreaContract = {
  code: 'HD-2026-052',
  customer: 'Công ty CP Hưng Thịnh Logistics',
  from: '2026-11-01',
  to: '2027-10-31',
  volume: 0,
  volumeUnit: 'container',
};

/** Danh mục dịch vụ cảng dùng cho "Gán dịch vụ". */
export const SERVICE_CATALOG: ServiceOption[] = [
  { name: 'Nâng hạ container hàng', group: 'Bốc xếp', unit: 'Container' },
  { name: 'Nâng hạ container rỗng', group: 'Bốc xếp', unit: 'Container' },
  { name: 'Xếp dỡ tàu container', group: 'Bốc xếp', unit: 'Container' },
  { name: 'Lưu bãi container hàng khô', group: 'Lưu bãi', unit: 'TEU-ngày' },
  { name: 'Lưu bãi container rỗng', group: 'Lưu bãi', unit: 'TEU-ngày' },
  { name: 'Lưu bãi container lạnh', group: 'Lưu bãi', unit: 'TEU-ngày' },
  { name: 'Đóng rút hàng lẻ', group: 'Kho CFS', unit: 'Tấn' },
  { name: 'Lưu kho hàng lẻ', group: 'Kho CFS', unit: 'Tấn-ngày' },
  { name: 'Kiểm đếm hàng hóa', group: 'Dịch vụ hỗ trợ', unit: 'Lô' },
  { name: 'Vệ sinh container', group: 'Dịch vụ hỗ trợ', unit: 'Container' },
  { name: 'Cung cấp điện container lạnh', group: 'Dịch vụ hỗ trợ', unit: 'Container-ngày' },
];

/** Nhân viên Phòng Khai thác dùng cho "Phân công nhân sự". */
export const STAFF_CATALOG: StaffOption[] = [
  { name: 'Lê Minh Tâm', staffCode: 'NV-KT-0086', phone: '0938 220 145', defaultTitle: 'Điều độ cảng' },
  { name: 'Nguyễn Hữu Phước', staffCode: 'NV-KT-0098', phone: '0909 778 230', defaultTitle: 'Giám sát an toàn' },
  { name: 'Trần Quốc Huy', staffCode: 'NV-KT-0112', phone: '0903 112 845', defaultTitle: 'Trưởng ca bãi' },
  { name: 'Phạm Thị Lan', staffCode: 'NV-KT-0127', phone: '0918 334 201', defaultTitle: 'Điều độ bãi' },
  { name: 'Hoàng Thị Mai', staffCode: 'NV-KT-0131', phone: '0912 450 337', defaultTitle: 'Thủ kho CFS' },
  { name: 'Đỗ Minh Khoa', staffCode: 'NV-KT-0140', phone: '0937 556 019', defaultTitle: 'Điều độ bãi' },
  { name: 'Bùi Văn Lộc', staffCode: 'NV-KT-0145', phone: '0976 118 902', defaultTitle: 'Kiểm đếm viên' },
  { name: 'Ngô Đức Thành', staffCode: 'NV-KT-0151', phone: '0905 667 120', defaultTitle: 'Trưởng ca bãi' },
  { name: 'Trịnh Văn Hải', staffCode: 'NV-KT-0160', phone: '0938 004 512', defaultTitle: 'Điều độ bãi' },
  { name: 'Vũ Thị Hạnh', staffCode: 'NV-KT-0172', phone: '0919 230 558', defaultTitle: 'Điều độ bãi' },
];
