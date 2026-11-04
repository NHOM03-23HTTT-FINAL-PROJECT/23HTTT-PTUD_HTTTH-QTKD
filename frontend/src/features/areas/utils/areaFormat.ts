import type { BadgeTone } from '@/components/status-badge/StatusBadge';
import type { IconName } from '@/components/icon/Icon';
import type { Area, AreaReferences, AreaTypeCode, CapacityUnit } from '../types/area';

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

/**
 * Chuẩn hóa giá trị loại mặt bằng từ DB/API (tiếng Việt hoặc enum code) về AreaTypeCode.
 */
export function normalizeAreaType(type: string | undefined | null): AreaTypeCode {
  if (!type) return 'BAI_CY';
  const clean = type.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean === 'CẢNG' || clean === 'CANG' || clean.includes('PORT')) return 'CANG';
  if (clean.includes('CẦU') || clean.includes('BEN') || clean.includes('CAU_BEN') || clean.includes('BERTH')) return 'CAU_BEN';
  if (clean.includes('CY') || clean.includes('BAI_CY') || clean.includes('YARD')) return 'BAI_CY';
  if (clean.includes('CFS') || clean.includes('KHO_CFS')) return 'KHO_CFS';
  if (clean.includes('LANH') || clean.includes('KHO_LANH') || clean.includes('COLD')) return 'KHO_LANH';
  if (clean.includes('PHU') || clean.includes('BAI_PHU') || clean.includes('BLOCK')) return 'BAI_PHU';
  return (clean in TYPE_ICON) ? (clean as AreaTypeCode) : 'BAI_CY';
}

export function areaTypeLabel(type: AreaTypeCode | string): string {
  if (!type) return '—';
  if (type in TYPE_LABEL) return TYPE_LABEL[type as AreaTypeCode];
  const normalized = normalizeAreaType(type);
  return TYPE_LABEL[normalized] ?? String(type);
}

export const AREA_STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Hoạt động', tone: 'success' },
  suspended: { label: 'Tạm ngưng', tone: 'warning' },
};

export function getAreaStatusBadge(status: string | undefined | null): { label: string; tone: BadgeTone } {
  const key = String(status ?? '').toLowerCase().trim();
  if (key === 'suspended' || key === 'tạm ngưng' || key === 'tam_ngung') {
    return AREA_STATUS_BADGE.suspended;
  }
  return AREA_STATUS_BADGE.active;
}

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
  if (area.level === 3) return 'layers';
  const code = normalizeAreaType(area.type);
  return TYPE_ICON[code] ?? 'grid';
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
