import './Pagination.css';

type PaginationProps = {
  page: number;
  total: number;
  size: number;
  sizes: readonly number[];
  /** Đơn vị trong dòng tóm tắt, ví dụ "khách hàng" hoặc "kết quả". */
  unit: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
};

/** Trang đầu, trang cuối và các trang quanh trang hiện tại; khoảng trống thay bằng "…" (frame 05.1). */
function pageItems(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1, ...(page <= 2 ? [2, 3] : [])]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) items.push('gap');
    items.push(p);
  });
  return items;
}

export function Pagination({ page, total, size, sizes, unit, disabled, onPageChange, onSizeChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);

  return (
    <nav className="pagination" aria-label="Phân trang">
      <p className="pagination__summary">
        Hiển thị {from}–{to} trên {total} {unit}
      </p>
      <div className="pagination__pages">
        {pageItems(page, pages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="pagination__page pagination__page--gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={item === page ? 'pagination__page pagination__page--current' : 'pagination__page'}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Trang ${item}`}
              disabled={disabled}
              onClick={() => item !== page && onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        {sizes.length > 1 && (
          <select
            className="pagination__size"
            aria-label="Số dòng mỗi trang"
            value={size}
            disabled={disabled}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s} / trang
              </option>
            ))}
          </select>
        )}
      </div>
    </nav>
  );
}
