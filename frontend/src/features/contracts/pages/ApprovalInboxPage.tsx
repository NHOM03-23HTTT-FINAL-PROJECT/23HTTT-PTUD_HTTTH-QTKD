import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Alert } from '@/components/feedback/Alert';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatMoney } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import { ContractActionError, type ApprovalInboxItem, type ApprovalStepKey } from '../types/contract';
import { CONTRACT_STATUS_BADGE, DECISION_LABELS } from '../utils/contractStatus';
import './Contracts.css';

const COPY: Record<ApprovalStepKey, { title: string; subtitle: string; action: string; empty: string }> = {
  sales: { title: 'Hồ sơ chờ tôi duyệt', subtitle: 'Hồ sơ đã trình thuộc phạm vi quản lý và được giao cho bạn ở bước Trưởng phòng Kinh doanh.', action: 'Rà soát', empty: 'Không có hồ sơ nào đang chờ bạn rà soát.' },
  legal: { title: 'Hợp đồng chờ rà soát pháp lý', subtitle: 'Hồ sơ đã được Trưởng phòng Kinh doanh chấp thuận và giao cho bạn ở bước Pháp chế.', action: 'Rà soát', empty: 'Không có hồ sơ nào đang chờ rà soát pháp lý.' },
  board: { title: 'Hồ sơ chờ phê duyệt', subtitle: 'Hồ sơ đã được Pháp chế kết luận đạt yêu cầu và giao cho bạn phê duyệt.', action: 'Xem & phê duyệt', empty: 'Không có hồ sơ nào đang chờ phê duyệt.' },
};

type Load = { kind: 'loading' } | { kind: 'ok'; items: ApprovalInboxItem[] } | { kind: 'error' };

/** 07.1 / 08.1 / 09.1 · Hồ sơ được giao tại bước của người dùng; `done` cho danh sách "Đã rà soát". */
export function ApprovalInboxPage({ step, done = false }: { step: ApprovalStepKey; done?: boolean }) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const copy = COPY[step];
  const title = done ? 'Hồ sơ đã rà soát' : copy.title;

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: 'loading' });
    contractsApi
      .inbox({ userId: user.id, signedInAt: user.signedInAt, step, done })
      .then((items) => active && setLoad({ kind: 'ok', items }))
      .catch((error) => {
        if (!active) return;
        if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else setLoad({ kind: 'error' });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, done, retry, user?.id]);

  const columns: Column<ApprovalInboxItem>[] = [
    { key: 'code', header: 'Mã hợp đồng', width: 130, render: (row) => <Link to={ROUTES.contractDetail(row.code)} className="contract-list__code">{row.code}</Link> },
    { key: 'title', header: 'Hợp đồng · khách hàng', render: (row) => <span className="contract-list__stack"><span>{row.title}</span><small>{row.customerName} · {row.ownerName}</small></span> },
    { key: 'value', header: 'Giá trị', width: 150, align: 'end', render: (row) => formatMoney(row.value) },
    done
      ? { key: 'decision', header: 'Kết quả', width: 170, render: (row) => <span className="contract-list__stack"><StatusBadge label={row.decision ? DECISION_LABELS[row.decision] : '—'} tone={row.decision === 'approve' ? 'success' : row.decision === 'reject' ? 'danger' : 'warning'} /><small>{row.decidedAt ? formatDateTime(row.decidedAt) : ''}</small></span> }
      : { key: 'assigned', header: 'Giao lúc', width: 170, render: (row) => <span className="contract-list__stack"><span>{row.assignedAt ? formatDateTime(row.assignedAt) : '—'}</span>{row.previousStep && <small>{row.previousStep}</small>}</span> },
    { key: 'status', header: 'Trạng thái', width: 140, render: (row) => <StatusBadge label={CONTRACT_STATUS_BADGE[row.status].label} tone={CONTRACT_STATUS_BADGE[row.status].tone} /> },
    { key: 'actions', header: '', width: 140, align: 'end', render: (row) => <Link to={ROUTES.contractDetail(row.code)} className={done ? 'btn btn--ghost' : 'btn btn--primary'}>{done ? 'Xem' : copy.action}</Link> },
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Phê duyệt</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">{title}</span></nav>
      <div className="page-header"><div className="page-header__title"><h1>{title}</h1><p>{done ? 'Hồ sơ bạn đã ghi nhận kết luận ở bước Pháp chế, gồm cả các lượt trước.' : copy.subtitle}</p></div></div>
      <section className="contract-results" aria-busy={load.kind === 'loading'}>
        <div className="contract-results__header"><h2>{load.kind === 'ok' ? `${load.items.length} hồ sơ` : 'Đang tải…'}</h2><p>Chỉ gồm hồ sơ mà bạn là người được giao chính thức.</p></div>
        {load.kind === 'error' && <div className="contract-results__message"><Alert tone="danger" title="Không thể tải danh sách hồ sơ" action={<button type="button" className="alert__link" onClick={() => setRetry((n) => n + 1)}>Tải lại</button>}>Đã xảy ra lỗi truy xuất dữ liệu.</Alert></div>}
        {load.kind === 'ok' && load.items.length === 0 && <div className="contract-empty"><span className="contract-empty__icon"><Icon name="inbox" /></span><h3>{done ? 'Chưa có hồ sơ đã rà soát' : copy.empty}</h3></div>}
        {load.kind === 'ok' && load.items.length > 0 && <DataTable columns={columns} rows={load.items} rowKey={(row) => `${row.code}-${row.submittedAt}`} />}
      </section>
    </>
  );
}
