import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import type { AreaLevel } from '../types/area';

export function LevelBadge({ level }: { level: number }) {
  return <span className="level-badge">Cấp {level}</span>;
}

export type ChainNode = {
  code: string;
  name: string;
  level: AreaLevel | number;
  /** Ghi chú sau mã, ví dụ "Khu vực cấp cha", "Chưa lưu", "Đang xem". */
  note?: string;
  /** Khu vực đang xét; mặc định là nút cuối cùng. */
  current?: boolean;
  /** Đã lưu: tên là liên kết mở chi tiết khu vực. */
  linked?: boolean;
};

/**
 * Vị trí trong sơ đồ phân cấp (02.2 / 02.3 / 13.1): chuỗi khu vực từ Cấp 1 tới khu vực đang xét (và phân khu con nếu
 * có), khu vực đang xét được tô màu nhấn. Thụt lề theo cấp.
 */
export function HierarchyChain({ nodes }: { nodes: ChainNode[] }) {
  const hasCurrent = nodes.some((n) => n.current);
  return (
    <ol className="hierarchy-chain">
      {nodes.map((node, index) => {
        const current = hasCurrent ? node.current : index === nodes.length - 1;
        return (
          <li
            key={`${node.code}-${index}`}
            className={current ? 'hierarchy-chain__node hierarchy-chain__node--current' : 'hierarchy-chain__node'}
            style={{ paddingLeft: 10 + (Number(node.level) - 1) * 18 }}
            aria-current={current ? 'location' : undefined}
          >
            <LevelBadge level={node.level} />
            <span className="hierarchy-chain__text">
              {node.linked && !current ? (
                <Link to={ROUTES.areaDetail(node.code)} className="hierarchy-chain__name hierarchy-chain__link">
                  {node.name}
                </Link>
              ) : (
                <span className="hierarchy-chain__name">{node.name}</span>
              )}
              <span className="hierarchy-chain__meta">
                {node.code}
                {node.note && ` · ${node.note}`}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const HIERARCHY_RULES = [
  'Tối đa 3 cấp logic: Cảng/ICD → Bãi/Kho/Cầu bến → Phân khu/Block (ARE-03).',
  'Khu vực cấp cha phải ở Cấp 1 hoặc Cấp 2.',
  'Không chọn chính khu vực đang sửa hoặc phân khu con trực thuộc (chống vòng lặp).',
  'Để trống khu vực cấp cha → khu vực Cấp 1 độc lập.',
  'Khu vực cha Tạm ngưng: phân khu con chịu hạn chế giao dịch theo khu vực cha.',
];
