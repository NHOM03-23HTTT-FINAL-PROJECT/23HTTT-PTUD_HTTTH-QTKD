import type { BadgeTone } from '@/components/status-badge/StatusBadge';
import type { IconName } from '@/components/icon/Icon';
import type { Area, AreaReferences, AreaStatus, AreaTypeCode, CapacityUnit } from '../types/area';

/** Danh mục loại mặt bằng (ghi chú 01.1: Cảng, Cầu bến, Bãi CY, Kho CFS, Bãi phụ…). */
export const AREA_TYPES: { value: AreaTypeCode; label: string }[] = [
  { value: 'CANG', label: 'Cảng' },
  { value: 'CAU_BEN', label: 'Cầu bến' },
  { value: 'BAI_CY', label: 'Bãi CY' },
  { value: 'KHO_CFS', label: 'Kho CFS' },
  { value: 'KHO_LANH', label: 'Kho lạnh' },
  { value: 'BAI_PHU', label: 'Bãi phụ' },
];

export const CAPACITY_UNITS: { value: CapacityUnit; label: string }[] = [
  { value: 'TEU', label: 'TEU' },
  { value: 'Tấn', label: 'Tấn' },
];

const TYPE_LABEL = Object.fromEntries(AREA_TYPES.map((t) => [t.value, t.label])) as Record<AreaTypeCode, string>;

export function areaTypeLabel(type: AreaTypeCode): string {
  return TYPE_LABEL[type];
}

export const AREA_STATUS_BADGE: Record<AreaStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Hoạt động', tone: 'success' },
  suspended: { label: 'Tạm ngưng', tone: 'warning' },
};

const TYPE_ICON: Record<AreaTypeCode, IconName> = {
  CANG: 'building',
  CAU_BEN: 'map-pin',
  BAI_CY: 'grid',
  KHO_CFS: 'inbox',
  KHO_LANH: 'inbox',
  BAI_PHU: 'grid',
};

/** Biểu tượng trên cây sơ đồ: phân khu Cấp 3 dùng "layers" như frame 02.1. */
export function areaIcon(area: Pick<Area, 'type' | 'level'>): IconName {
  return area.level === 3 ? 'layers' : TYPE_ICON[area.type];
}

/** "4 bảng giá · 6 hợp đồng · 12 kỳ sản lượng" – bỏ nhóm bằng 0; null khi chưa có tham chiếu (04.1 / 04.8). */
export function describeReferences(refs: AreaReferences): string | null {
  const parts = [
    refs.priceLists && `${refs.priceLists} bảng giá`,
    refs.contracts && `${refs.contracts} hợp đồng`,
    refs.outputPeriods && `${refs.outputPeriods} kỳ sản lượng`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const numberFormat = new Intl.NumberFormat('vi-VN');

export function formatAreaNumber(value: number | null): string {
  return value === null ? '—' : numberFormat.format(value);
}

export function formatAreaSize(value: number | null): string {
  return value === null ? '—' : `${numberFormat.format(value)} m²`;
}

export function formatCapacity(value: number | null, unit: CapacityUnit): string {
  return value === null ? '—' : `${numberFormat.format(value)} ${unit}`;
}
