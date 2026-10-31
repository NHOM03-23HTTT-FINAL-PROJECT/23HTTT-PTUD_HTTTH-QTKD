import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { formatDate, formatDateTime } from '@/utils/format';
import { areasApi } from '../api/areasApi';
import type { AreaRecordsState } from '../hooks/useAreaRecords';
import type { Area } from '../types/area';
import { AREA_FIELD_LABELS } from '../utils/areaChanges';
import { AREA_STATUS_BADGE, areaTypeLabel, formatAreaSize, formatCapacity } from '../utils/areaFormat';

type SectionKey = 'identity' | 'hierarchy' | 'services' | 'staff' | 'priceLists' | 'contracts' | 'history';

const SECTIONS: { key: SectionKey; label: string; defaultOn: boolean }[] = [
  { key: 'identity', label: 'Thông tin định danh & thông số kỹ thuật', defaultOn: true },
  { key: 'hierarchy', label: 'Sơ đồ phân cấp & phân khu con', defaultOn: true },
  { key: 'services', label: 'Dịch vụ khai thác', defaultOn: true },
  { key: 'staff', label: 'Nhân sự phụ trách', defaultOn: true },
  { key: 'priceLists', label: 'Bảng giá dịch vụ đang hiệu lực', defaultOn: true },
  { key: 'contracts', label: 'Hợp đồng & sản lượng kỳ gần nhất', defaultOn: true },
  { key: 'history', label: 'Lịch sử biến động (Audit log)', defaultOn: false },
];

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="muted">Không có dữ liệu.</p>';
  return `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function unavailable(group: string): string {
  return `<p class="muted">Không tải được dữ liệu ${escape(group)} tại thời điểm xuất.</p>`;
}

/** Dựng tài liệu HTML khổ A4 của hồ sơ khu vực; trình duyệt in ra PDF. Tệp ghi người xuất và thời điểm xuất. */
function buildProfileHtml(area: Area, chain: Area[], children: Area[], records: AreaRecordsState, sections: Set<SectionKey>, exporter: string) {
  const exportedAt = formatDateTime(Date.now());
  const parts: string[] = [];
  if (sections.has('identity')) {
    const rows: [string, string][] = [
      ['Mã khu vực', area.code],
      ['Tên khu vực', area.name],
      ['Loại mặt bằng', areaTypeLabel(area.type)],
      ['Trạng thái', AREA_STATUS_BADGE[area.status].label],
      ['Cấp phân cấp', `Cấp ${area.level}`],
      [AREA_FIELD_LABELS.gps, area.gps || '—'],
      [AREA_FIELD_LABELS.areaSize, formatAreaSize(area.areaSize)],
      [AREA_FIELD_LABELS.capacity, formatCapacity(area.capacity, area.capacityUnit)],
      [AREA_FIELD_LABELS.standards, area.standards || '—'],
      ['Phiên bản', String(area.version)],
    ];
    parts.push(`<h2>Thông tin định danh &amp; thông số kỹ thuật</h2>${table(['Thông tin', 'Giá trị'], rows)}`);
  }
  if (sections.has('hierarchy')) {
    parts.push(
      `<h2>Sơ đồ phân cấp &amp; phân khu con</h2><p>Đường dẫn: ${escape(area.path)}</p><p>${chain
        .map((a) => `Cấp ${a.level}: ${escape(a.name)} (${escape(a.code)})`)
        .join(' → ')}</p>${table(
        ['Mã', 'Tên', 'Loại', 'Diện tích', 'Sức chứa'],
        children.map((c) => [c.code, c.name, areaTypeLabel(c.type), formatAreaSize(c.areaSize), formatCapacity(c.capacity, c.capacityUnit)]),
      )}`,
    );
  }
  if (sections.has('services')) {
    const s = records.services;
    parts.push(
      `<h2>Dịch vụ khai thác</h2>${
        s.status === 'ok' ? table(['Dịch vụ', 'Nhóm', 'Đơn vị tính', 'Áp dụng từ'], s.data.map((x) => [x.name, x.group, x.unit, formatDate(x.since)])) : unavailable('dịch vụ')
      }`,
    );
  }
  if (sections.has('staff')) {
    const s = records.staff;
    parts.push(
      `<h2>Nhân sự phụ trách</h2>${
        s.status === 'ok'
          ? table(['Nhân viên', 'Chức danh', 'Ca trực', 'Phụ trách từ'], s.data.map((x) => [`${x.name} (${x.staffCode})`, x.title, x.shift, formatDate(x.since)]))
          : unavailable('nhân sự')
      }`,
    );
  }
  if (sections.has('priceLists')) {
    const s = records.priceLists;
    parts.push(
      `<h2>Bảng giá dịch vụ đang hiệu lực</h2>${
        s.status === 'ok'
          ? table(
              ['Mã bảng giá', 'Khách hàng · Hợp đồng', 'Dịch vụ', 'Hiệu lực'],
              s.data.map((x) => [x.code, `${x.customer} · ${x.contract}`, x.services, `${formatDate(x.from)} – ${formatDate(x.to)}`]),
            )
          : unavailable('bảng giá')
      }`,
    );
  }
  if (sections.has('contracts')) {
    const s = records.contracts;
    parts.push(
      `<h2>Hợp đồng &amp; sản lượng kỳ gần nhất</h2>${
        s.status === 'ok'
          ? `${s.data.output ? `<p>Kỳ ${escape(s.data.output.period)}: ${s.data.output.lifts.toLocaleString('vi-VN')} container nâng hạ · ${s.data.output.storageTeuDays.toLocaleString('vi-VN')} TEU-ngày lưu bãi</p>` : ''}${table(
              ['Số hợp đồng', 'Khách hàng', 'Hiệu lực', 'Sản lượng'],
              s.data.items.map((x) => [x.code, x.customer, `${formatDate(x.from)} – ${formatDate(x.to)}`, `${x.volume.toLocaleString('vi-VN')} ${x.volumeUnit}`]),
            )}`
          : unavailable('hợp đồng và sản lượng')
      }`,
    );
  }
  if (sections.has('history')) {
    parts.push(
      `<h2>Lịch sử biến động</h2>${table(
        ['Thời điểm', 'Người thao tác', 'Hành động', 'Nội dung'],
        [...area.history].reverse().map((h) => [formatDateTime(h.at), h.by, h.action, `${h.detail}${h.reason ? ` Lý do: ${h.reason}` : ''}`]),
      )}`,
    );
  }

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Lý lịch khu vực ${escape(area.code)}</title><style>
@page{size:A4;margin:16mm}body{font-family:'Inter',system-ui,sans-serif;color:#0f172a;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f8fafc}.muted{color:#64748b}.meta{color:#475569;margin:0 0 12px}
</style></head><body><h1>Lý lịch khu vực ${escape(area.name)} (${escape(area.code)})</h1>
<p class="meta">ABC Logistics · Người xuất: ${escape(exporter)} · Thời điểm xuất: ${exportedAt}</p>${parts.join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
}

type ExportProfileDialogProps = {
  area: Area;
  chain: Area[];
  items: Area[];
  records: AreaRecordsState;
  onClose: () => void;
  onExported: (at: string) => void;
};

/** 13.11 · Xuất file lý lịch khu vực: chọn phần nội dung, kết xuất PDF khổ A4 ghi người xuất và thời điểm xuất. */
export function ExportProfileDialog({ area, chain, items, records, onClose, onExported }: ExportProfileDialogProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<SectionKey>>(() => new Set(SECTIONS.filter((s) => s.defaultOn).map((s) => s.key)));
  const [blocked, setBlocked] = useState(false);

  function toggle(key: SectionKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportPdf() {
    if (!user || selected.size === 0) return;
    const exporter = areasApi.recordExport(user.id, user.signedInAt, area.code, SECTIONS.filter((s) => selected.has(s.key)).map((s) => s.label));
    const html = buildProfileHtml(area, chain, items, records, selected, exporter);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const opened = window.open(url, '_blank');
    // Trình duyệt chặn cửa sổ mới: tải tệp HTML để người dùng mở và in ra PDF.
    if (!opened) {
      setBlocked(true);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ly-lich-${area.code}.html`;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (opened) onExported(new Date().toISOString());
  }

  return (
    <Dialog
      title="Xuất file lý lịch khu vực"
      width={560}
      initialFocus="first"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={selected.size === 0} onClick={exportPdf}>
            Xuất PDF
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        Chọn nội dung đưa vào hồ sơ lý lịch của {area.name} ({area.code}) để lưu trữ hoặc báo cáo.
      </p>
      <div className="export-sections" role="group" aria-label="Nội dung xuất">
        {SECTIONS.map((section) => {
          const on = selected.has(section.key);
          return (
            <label key={section.key} className="export-sections__item">
              <input type="checkbox" checked={on} onChange={() => toggle(section.key)} />
              <span className={on ? 'export-sections__box export-sections__box--on' : 'export-sections__box'} aria-hidden>
                {on && <Icon name="check" size={14} />}
              </span>
              {section.label}
            </label>
          );
        })}
      </div>
      <div className="area-preview area-preview--plain">
        <div>
          <span className="area-preview__label">Định dạng</span>
          <span className="area-preview__value">PDF · khổ A4</span>
        </div>
        <div>
          <span className="area-preview__label">Ghi trên tệp</span>
          <span className="area-preview__value">Người xuất, thời điểm xuất</span>
        </div>
      </div>
      {blocked && (
        <Alert tone="warning" title="Trình duyệt đã chặn cửa sổ in">
          Tệp lý lịch đã được tải xuống dạng HTML; mở tệp và chọn In → Lưu thành PDF.
        </Alert>
      )}
    </Dialog>
  );
}
