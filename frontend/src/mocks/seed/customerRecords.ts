import type { CustomerRecordsByGroup } from '@/features/customers/types/customerRecords';

/*
 * Hồ sơ liên quan của khách hàng cho UC-CUS-06 (tab Hợp đồng / Bảng giá / Bảng thanh toán). Khi có BE, dữ liệu lấy
 * từ các phân hệ Hợp đồng, Bảng giá, Thanh toán và chỉ trả về hồ sơ trong phạm vi quyền của người xem.
 */
export const SEED_CUSTOMER_RECORDS: Record<string, CustomerRecordsByGroup> = {
  'KH-000198': {
    contracts: [
      {
        code: 'HD-2025-061',
        service: 'Khai thác bến container',
        note: 'Có 1 phụ lục',
        start: '2025-01-01',
        end: '2026-12-31',
        state: 'signed',
        signedAt: '2024-12-20',
        appendix: 'PL-01 · điều chỉnh khung giờ cập cầu (01/06/2025)',
        priceList: 'BG-2025-040 · phiên bản 3 hiện hành',
      },
      {
        code: 'HD-2026-013',
        service: 'Khai thác bến container – mở rộng',
        note: 'Trình 25/10/2026',
        start: '2027-01-01',
        end: '2028-12-31',
        state: 'pending',
        pendingStep: 'Pháp chế',
      },
      {
        code: 'HD-2024-022',
        service: 'Lưu bãi container',
        note: 'Không gia hạn',
        start: '2024-04-01',
        end: '2025-03-31',
        state: 'signed',
        signedAt: '2024-03-15',
        priceList: 'BG-2024-011 · phiên bản 1',
      },
    ],
    priceLists: [
      ...[
        { version: 1, from: '2025-01-01', to: '2025-06-30', approvedAt: '2024-12-18', prices: [500000, 750000, 1150] },
        { version: 2, from: '2025-07-01', to: '2025-12-31', approvedAt: '2025-06-20', prices: [520000, 780000, 1200] },
        { version: 3, from: '2026-01-01', to: undefined, approvedAt: '2025-12-15', prices: [545000, 815000, 1250] },
      ].map(({ version, from, to, approvedAt, prices }) => ({
        id: `BG-2025-040-v${version}`,
        code: 'BG-2025-040',
        version,
        from,
        to,
        service: 'Khai thác bến container',
        contractCode: 'HD-2025-061',
        state: 'approved' as const,
        approvedBy: 'Ban Giám đốc',
        approvedAt,
        items: [
          { name: "Xếp dỡ container 20' có hàng", unit: 'container', price: prices[0] },
          { name: "Xếp dỡ container 40' có hàng", unit: 'container', price: prices[1] },
          { name: 'Cập cầu tàu', unit: 'GT / giờ', price: prices[2] },
        ],
      })),
      {
        id: 'BG-2026-015-v1',
        code: 'BG-2026-015',
        version: 1,
        from: '2026-10-01',
        to: '2026-12-31',
        service: 'Lưu bãi container',
        contractCode: 'HD-2025-061',
        state: 'approved',
        approvedBy: 'Lê Thị Hồng',
        approvedAt: '2026-09-25',
        items: [{ name: 'Lưu bãi container rỗng', unit: 'TEU / ngày', price: 18000 }],
      },
      {
        id: 'BG-2026-018-v1',
        code: 'BG-2026-018',
        version: 1,
        from: '2026-10-15',
        to: '2027-03-31',
        service: 'Lưu bãi container',
        state: 'approved',
        approvedBy: 'Lê Thị Hồng',
        approvedAt: '2026-10-12',
        items: [{ name: 'Lưu bãi container rỗng', unit: 'TEU / ngày', price: 16500 }],
      },
    ],
    payments: [
      ['BTT-2026-0105', '10/2026', 1312800000, '2026-10-30', 'reconciling'],
      ['BTT-2026-0098', '09/2026', 1284500000, '2026-10-05', 'issued'],
      ['BTT-2026-0087', '08/2026', 1192000000, '2026-09-04', 'issued'],
      ['BTT-2026-0076', '07/2026', 1205300000, '2026-08-05', 'issued'],
    ].map(([code, period, total, issuedAt, state], index) => ({
      code: code as string,
      period: period as string,
      contractCode: 'HD-2025-061',
      total: total as number,
      issuedAt: issuedAt as string,
      state: state as 'reconciling' | 'issued',
      // Các bảng lập trước khi khách đổi địa chỉ giữ địa chỉ cũ tại thời điểm lập.
      snapshot: {
        name: 'CTCP Cảng Sao Biển',
        taxCode: '0301234567',
        address: index >= 2 ? '120 Nguyễn Tất Thành, Phường Xóm Chiếu, TP. Hồ Chí Minh' : '12 Nguyễn Tất Thành, Phường Xóm Chiếu, TP. Hồ Chí Minh',
        representative: 'Đỗ Minh Khang',
      },
    })),
  },
  'KH-000276': {
    contracts: [
      {
        code: 'HD-2025-044',
        service: 'Vận hành thiết bị nâng',
        note: 'Không có phụ lục',
        start: '2025-01-01',
        end: '2026-12-31',
        state: 'signed',
        signedAt: '2024-12-26',
      },
      { code: 'HD-2026-012', service: 'Vận chuyển nội địa', note: 'Dự thảo của Nguyễn Văn An', start: '2027-01-01', end: '2027-12-31', state: 'draft' },
    ],
    priceLists: [
      {
        id: 'BG-2026-031-v1',
        code: 'BG-2026-031',
        version: 1,
        from: '2026-11-01',
        service: 'Vận hành thiết bị nâng',
        contractCode: 'HD-2025-044',
        state: 'pending',
        items: [{ name: 'Vận hành cẩu RTG', unit: 'giờ', price: 2350000 }],
      },
    ],
    payments: [
      {
        code: 'BTT-2026-0102',
        period: '09/2026',
        contractCode: 'HD-2025-044',
        total: 486200000,
        issuedAt: '2026-10-06',
        state: 'issued',
        snapshot: { name: 'Vận tải Hoàng Long', taxCode: '0109876543', address: '88 Phạm Văn Đồng, Phường Cổ Nhuế, Hà Nội', representative: 'Hoàng Văn Long' },
      },
    ],
  },
  'KH-000310': {
    contracts: [
      {
        code: 'HD-2026-006',
        service: 'Hợp đồng khung 24 tháng',
        note: 'Khai thác cảng, lưu kho, bốc xếp',
        start: '2026-10-01',
        end: '2028-09-30',
        state: 'signed',
        signedAt: '2026-09-28',
      },
    ],
    priceLists: [],
    payments: [],
  },
};

/** Khách hàng dùng để giả lập nhóm Bảng thanh toán không tải được ở lần đầu (06.9 – A5.5). */
export const SIMULATED_RECORDS_FAILURE = { code: 'KH-000310', group: 'payments' } as const;
