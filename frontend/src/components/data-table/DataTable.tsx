import type { ReactNode } from 'react';
import './DataTable.css';

export type Column<Row> = {
  key: string;
  header: string;
  /** Độ rộng cố định (px); bỏ trống để cột co giãn lấp phần còn lại. */
  width?: number;
  align?: 'start' | 'end';
  render: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyText?: string;
};

export function DataTable<Row>({ columns, rows, rowKey, emptyText = 'Chưa có dữ liệu.' }: DataTableProps<Row>) {
  return (
    <div className="data-table" role="table">
      <div className="data-table__row data-table__row--head" role="row">
        {columns.map((column) => (
          <div key={column.key} role="columnheader" className={cellClass(column)} style={cellStyle(column)}>
            {column.header}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="data-table__empty">{emptyText}</p>
      ) : (
        rows.map((row) => (
          <div key={rowKey(row)} className="data-table__row" role="row">
            {columns.map((column) => (
              <div key={column.key} role="cell" className={cellClass(column)} style={cellStyle(column)}>
                {column.render(row)}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

type CellLayout = Pick<Column<never>, 'width' | 'align'>;

function cellClass(column: CellLayout) {
  return column.align === 'end' ? 'data-table__cell data-table__cell--end' : 'data-table__cell';
}

function cellStyle(column: CellLayout) {
  return column.width ? { width: column.width, flexShrink: 0 } : { flex: 1, minWidth: 0 };
}
