import type { BadgeTone } from '@/components/status-badge/StatusBadge';
import type { ContractRecord, IsoDate, PriceListVersion } from '../types/customerRecords';

export type ContractStatusKey = 'active' | 'upcoming' | 'expired' | 'pending' | 'draft' | 'cancelled';

export const CONTRACT_STATUS_LABELS: Record<ContractStatusKey, string> = {
  active: 'Đang hiệu lực',
  upcoming: 'Chưa hiệu lực',
  expired: 'Hết hiệu lực',
  pending: 'Chờ duyệt',
  draft: 'Dự thảo',
  cancelled: 'Đã hủy',
};

const CONTRACT_STATUS_TONE: Record<ContractStatusKey, BadgeTone> = {
  active: 'success',
  upcoming: 'info',
  expired: 'neutral',
  pending: 'info',
  draft: 'neutral',
  cancelled: 'neutral',
};

/** Trạng thái hợp đồng tại thời điểm đối chiếu (06.2): hợp đồng đã ký xét theo thời hạn, các trạng thái khác giữ nguyên. */
export function contractStatusAt(contract: ContractRecord, date: IsoDate): ContractStatusKey {
  if (contract.state !== 'signed') return contract.state;
  if (date < contract.start) return 'upcoming';
  if (date > contract.end) return 'expired';
  return 'active';
}

export function contractBadge(contract: ContractRecord, date: IsoDate): { label: string; tone: BadgeTone } {
  const key = contractStatusAt(contract, date);
  const label = key === 'pending' && contract.pendingStep ? `Chờ duyệt · ${contract.pendingStep}` : CONTRACT_STATUS_LABELS[key];
  return { label, tone: CONTRACT_STATUS_TONE[key] };
}

/** Phiên bản đã duyệt có hiệu lực tại ngày `date`. Bảng giá chờ duyệt không dùng để xác định giá. */
export function priceApplies(version: PriceListVersion, date: IsoDate): boolean {
  return version.state === 'approved' && version.from <= date && (!version.to || date <= version.to);
}

export type PriceStatus = 'current' | 'at-date' | 'replaced' | 'upcoming' | 'pending' | 'conflict';

/** Nhãn của phiên bản bảng giá so với hôm nay và thời điểm đang xem (06.3). */
export function priceStatus(version: PriceListVersion, date: IsoDate, today: IsoDate): PriceStatus {
  if (version.state === 'pending') return 'pending';
  if (priceApplies(version, today)) return 'current';
  if (priceApplies(version, date)) return 'at-date';
  if (version.to && version.to < today) return 'replaced';
  return 'upcoming';
}

/** Khoảng thời gian trùng của các phiên bản cùng hiệu lực (06.4). */
export function overlapRange(versions: PriceListVersion[]): { from: IsoDate; to?: IsoDate } {
  const from = versions.map((v) => v.from).sort().at(-1)!;
  const ends = versions.map((v) => v.to).filter((t): t is IsoDate => Boolean(t)).sort();
  return { from, to: ends[0] };
}
