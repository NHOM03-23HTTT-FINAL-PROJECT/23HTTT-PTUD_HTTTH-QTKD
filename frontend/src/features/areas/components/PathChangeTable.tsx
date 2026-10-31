import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import type { AreaPathChange } from '../types/area';

type PathChangeTableProps = {
  changes: AreaPathChange[];
  /** Sau khi lưu (02.7): gắn nhãn "Mới cập nhật" cho đường dẫn sau và liên kết mã khu vực. */
  saved?: boolean;
};

/** Bảng đối chiếu đường dẫn phân cấp trước → sau của khu vực và các phân khu con trực thuộc. */
export function PathChangeTable({ changes, saved }: PathChangeTableProps) {
  return (
    <div className="path-table__wrap">
      <table className="path-table">
        <thead>
          <tr>
            <th scope="col">Khu vực</th>
            <th scope="col">Cấp</th>
            <th scope="col">Đường dẫn trước</th>
            <th scope="col">Đường dẫn sau</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.code}>
              <th scope="row">
                {saved ? (
                  <Link to={ROUTES.areaDetail(change.code)} className="area-code">
                    {change.code}
                  </Link>
                ) : (
                  <span className="area-code">{change.code}</span>
                )}
                <span className="path-table__name">{change.name}</span>
              </th>
              <td>{change.levelBefore === change.level ? change.level : `${change.levelBefore} → ${change.level}`}</td>
              <td>
                <del className="path-table__before">{change.pathBefore}</del>
              </td>
              <td>
                <span className="path-table__after">{change.path}</span>
                {saved && <span className="area-tag area-tag--accent">Mới cập nhật</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
