import type { ContractServiceOption, ContractTemplate } from '@/features/contracts/types/contract';

export const CONTRACT_TYPES = [
  'Hợp đồng dịch vụ kho bãi',
  'Hợp đồng dịch vụ bốc xếp',
  'Hợp đồng vận chuyển nội địa',
  'Hợp đồng dịch vụ logistics tổng hợp',
];

export const CONTRACT_SERVICE_CATALOG: ContractServiceOption[] = [
  { serviceCode: 'DV-KB-01', serviceName: 'Lưu kho hàng khô', unit: 'm²/tháng', requiresArea: true },
  { serviceCode: 'DV-BX-03', serviceName: 'Bốc xếp container', unit: 'container', requiresArea: true },
  { serviceCode: 'DV-VC-02', serviceName: 'Vận chuyển nội địa', unit: 'chuyến', requiresArea: false },
  { serviceCode: 'DV-KH-04', serviceName: 'Khai thác cầu bến', unit: 'tấn', requiresArea: true },
];

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    code: 'MHD-KB-02',
    name: 'Dịch vụ kho bãi & bốc xếp',
    version: 'v2.1 – áp dụng từ 01/07/2026',
    title: 'Hợp đồng dịch vụ kho bãi và bốc xếp 2026–2027',
    contractType: 'Hợp đồng dịch vụ kho bãi',
    paymentTerm: 'Chuyển khoản hàng tháng, trong 30 ngày kể từ ngày nhận đủ chứng từ.',
    content:
      'ĐIỀU 1. PHẠM VI DỊCH VỤ\nBên cung cấp thực hiện dịch vụ kho bãi và bốc xếp theo các hạng mục được chọn.\n\nĐIỀU 2. GIÁ TRỊ VÀ THANH TOÁN\nGiá trị, đơn giá và kỳ thanh toán thực hiện theo phụ lục của hợp đồng.\n\nĐIỀU 3. HIỆU LỰC\nHợp đồng có hiệu lực trong thời hạn đã ghi tại phần thông tin chung.',
    services: CONTRACT_SERVICE_CATALOG.slice(0, 3),
  },
  {
    code: 'MHD-VC-01',
    name: 'Vận chuyển nội địa',
    version: 'v1.4 – áp dụng từ 15/08/2026',
    title: 'Hợp đồng vận chuyển hàng hóa nội địa',
    contractType: 'Hợp đồng vận chuyển nội địa',
    paymentTerm: 'Đối soát theo tháng và thanh toán trong 15 ngày.',
    content:
      'ĐIỀU 1. PHẠM VI VẬN CHUYỂN\nBên cung cấp vận chuyển hàng hóa theo lệnh điều vận được xác nhận.\n\nĐIỀU 2. THANH TOÁN\nHai bên đối soát sản lượng và thanh toán theo kỳ.',
    services: [CONTRACT_SERVICE_CATALOG[2]],
  },
];

/** Nhập tiêu đề bắt đầu bằng chuỗi này để kiểm thử tình huống lỗi ghi 01.8; chỉ lỗi ở lần thử đầu. */
export const SIMULATED_CONTRACT_SAVE_ERROR_PREFIX = 'LOI-503';
