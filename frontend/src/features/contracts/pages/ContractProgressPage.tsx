import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatTime } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import { ContractUnavailable, StepTimeline } from '../components/ContractDetailParts';
import { ContractActionError, type ApprovalAction, type ApprovalRound, type ApprovalStepKey, type Contract } from '../types/contract';
import { ACTION_LABELS, CONTRACT_STATUS_BADGE, ROUND_RESULT_BADGE, STEP_LABELS, STEP_ORDER } from '../utils/contractStatus';
import './Contracts.css';

type Load = { kind: 'loading' } | { kind: 'ok'; contract: Contract; loadedAt: number } | { kind: 'forbidden' | 'not-found' | 'error' };

type LogFilter = { step: ApprovalStepKey | ''; action: ApprovalAction | ''; actor: string };

const EMPTY_FILTER: LogFilter = { step: '', action: '', actor: '' };

/** Mở từ danh sách "Theo dõi tiến độ" (A10): backTo là URL danh sách, kèm bộ lọc, để "Đóng" quay về. */
export type ContractProgressState = { backTo?: string };

/** SYS-CTR-11 · Theo dõi tiến độ và lịch sử phê duyệt – chỉ xem, không thay đổi dữ liệu hồ sơ. */
export function ContractProgressPage() {
  const { code = '' } = useParams();
  const backTo = (useLocation().state as ContractProgressState | null)?.backTo;
  const { user } = useAuth();
  const { endSession } = useSession();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [roundNo, setRoundNo] = useState<number | null>(null);
  const [filter, setFilter] = useState<LogFilter>(EMPTY_FILTER);
  const now = useNow(load.kind === 'ok' ? 5000 : null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: 'loading' });
    contractsApi
      .getDetail({ userId: user.id, signedInAt: user.signedInAt, code, retry: retry > 0 })
      .then((contract) => {
        if (!active) return;
        setLoad({ kind: 'ok', contract, loadedAt: Date.now() });
        setRoundNo((current) => (current && contract.rounds.some((round) => round.no === current) ? current : contract.rounds[contract.rounds.length - 1]?.no ?? null));
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else if (error instanceof ContractActionError && error.code === 'FORBIDDEN') setLoad({ kind: 'forbidden' });
        else if (error instanceof ContractActionError && error.code === 'NOT_FOUND') setLoad({ kind: 'not-found' });
        else setLoad({ kind: 'error' });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, retry, user?.id]);

  // E4: phát hiện tiến độ đổi trong lúc xem; không ghép dữ liệu cũ và mới, chỉ mời tải lại.
  const changed = useMemo(() => {
    if (load.kind !== 'ok') return false;
    const latest = contractsApi.getContract(code);
    return Boolean(latest && latest.updatedAt !== load.contract.updatedAt);
  }, [load, code, now]);

  const breadcrumb = <nav className="breadcrumb" aria-label="Đường dẫn">{backTo ? <Link to={backTo}>Theo dõi tiến độ</Link> : <Link to={ROUTES.contracts}>Hợp đồng</Link>}<span className="breadcrumb__separator">/</span><Link to={ROUTES.contractDetail(code)}>{code}</Link><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">Tiến độ và lịch sử phê duyệt</span></nav>;
  if (!user) return null;
  if (load.kind === 'loading') return <>{breadcrumb}<p className="contract-loading">Đang tải tiến độ…</p></>;
  if (load.kind !== 'ok') {
    return <>{breadcrumb}<ContractUnavailable kind={load.kind} code={code} onRetry={load.kind === 'error' ? () => setRetry((n) => n + 1) : undefined} backTo={load.kind === 'error' ? ROUTES.contractDetail(code) : ROUTES.contracts} backLabel={load.kind === 'error' ? 'Về chi tiết hợp đồng' : 'Quay lại danh sách hợp đồng'} /></>;
  }

  const { contract, loadedAt } = load;
  const status = CONTRACT_STATUS_BADGE[contract.status];
  const round = contract.rounds.find((item) => item.no === roundNo);
  const latestNo = contract.rounds[contract.rounds.length - 1]?.no;

  return (
    <>
      {breadcrumb}
      <div className="page-header">
        <div className="page-header__title contract-detail-title">
          <div><h1>Tiến độ và lịch sử phê duyệt</h1><StatusBadge label={status.label} tone={status.tone} /></div>
          <p>{contract.code} · {contract.title} · {contract.customerName}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}><Icon name="refresh" size={16} /> Tải lại</Button>
          <ButtonLink to={backTo ?? ROUTES.contractDetail(code)} variant="secondary">Đóng</ButtonLink>
        </div>
      </div>

      <p className="contract-progress__stamp"><Icon name="clock" size={14} /> Dữ liệu cập nhật lúc {formatTime(loadedAt)} · lịch sử chỉ xem, không sửa hoặc xóa được.</p>
      {changed && <Alert tone="warning" title="Tiến độ đã thay đổi trong lúc bạn xem" action={<button type="button" className="alert__link" onClick={() => setRetry((n) => n + 1)}>Tải lại để xem tình trạng mới nhất</button>}>Màn hình đang hiển thị dữ liệu lúc {formatTime(loadedAt)}.</Alert>}

      {contract.rounds.length === 0 ? (
        <div className="contract-card contract-not-found">
          <span className="contract-not-found__icon"><Icon name="workflow" size={28} /></span>
          <h1>Hồ sơ chưa được trình duyệt</h1>
          <p>Hồ sơ đang ở trạng thái {status.label}. Tuyến duyệt chỉ hiển thị sau khi người phụ trách gửi trình duyệt.</p>
          <div className="contract-not-found__actions"><ButtonLink to={ROUTES.contractDetail(code)} variant="secondary">Về chi tiết hợp đồng</ButtonLink></div>
        </div>
      ) : (
        <div className="contract-progress">
          {contract.rounds.length > 1 && (
            <section className="contract-card contract-progress__rounds">
              <h2>Các lượt duyệt ({contract.rounds.length})</h2>
              <div className="contract-progress__round-list" role="tablist">
                {[...contract.rounds].reverse().map((item) => (
                  <button key={item.no} type="button" role="tab" aria-selected={item.no === roundNo} className={item.no === roundNo ? 'contract-round contract-round--active' : 'contract-round'} onClick={() => { setRoundNo(item.no); setFilter(EMPTY_FILTER); }}>
                    <strong>Lượt {item.no}</strong><span>{formatDateTime(item.submittedAt)}</span>
                    <StatusBadge label={ROUND_RESULT_BADGE[item.result].label} tone={ROUND_RESULT_BADGE[item.result].tone} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {round && <RoundView contract={contract} round={round} isLatest={round.no === latestNo} canSeeInternal={user.roles.includes('NV_PC')} filter={filter} onFilter={setFilter} />}
        </div>
      )}
    </>
  );
}

function RoundView({ contract, round, isLatest, canSeeInternal, filter, onFilter }: { contract: Contract; round: ApprovalRound; isLatest: boolean; canSeeInternal: boolean; filter: LogFilter; onFilter: (filter: LogFilter) => void }) {
  const result = ROUND_RESULT_BADGE[round.result];
  const stopped = round.steps.find((step) => step.state === 'stopped');
  const actors = [...new Set(round.log.map((entry) => entry.actorName))];
  const actions = [...new Set(round.log.map((entry) => entry.action))];
  const entries = round.log
    .filter((entry) => (!filter.step || entry.stepKey === filter.step) && (!filter.action || entry.action === filter.action) && (!filter.actor || entry.actorName === filter.actor))
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  const filtered = Boolean(filter.step || filter.action || filter.actor);

  return (
    <>
      {!isLatest && <Alert tone="info" title={`Đang xem lượt ${round.no} ở chế độ chỉ xem`}>Kết quả của lượt cũ không được áp dụng cho lượt mới; lượt trình lại bắt đầu từ bước Trưởng phòng Kinh doanh.</Alert>}
      {round.result === 'withdrawn' && <Alert tone="info" title="Lượt đã rút trước khi rà soát">{round.submittedByName} đã rút hồ sơ lúc {round.endedAt ? formatDateTime(round.endedAt) : ''}; hồ sơ trở về Nháp và lượt này không còn bước đang xử lý.</Alert>}
      {stopped && <Alert tone={round.result === 'rejected' ? 'danger' : 'warning'} title={`Lượt dừng tại bước ${stopped.label}`}>{stopped.decidedByName} · {stopped.decidedAt ? formatDateTime(stopped.decidedAt) : ''}: {stopped.comment ?? 'Nội dung ngoài phạm vi được xem.'} Các bước sau ghi "Không thực hiện".{isLatest && contract.status === 'revision-requested' ? ' Hồ sơ đang chờ chỉnh sửa và trình lại.' : ''}</Alert>}
      {round.result === 'completed' && <Alert tone="success" title="Hồ sơ đã được phê duyệt">Hoàn tất lượt lúc {round.endedAt ? formatDateTime(round.endedAt) : ''}; phiên bản hợp đồng được duyệt: {round.contractVersion}. Tiến độ ký kết theo dõi ở nghiệp vụ ký kết (UC-CTR-03).</Alert>}

      <div className="contract-layout">
        <section className="contract-card">
          <div className="contract-section__heading"><h2>Tuyến duyệt · lượt {round.no}</h2><p>Theo cấu hình {round.configCode} phiên bản {round.configVersion} gắn lúc trình.</p></div>
          <StepTimeline round={round} />
        </section>
        <aside className="contract-layout__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin lượt duyệt</h2>
            <div className="side-card__item"><span className="side-card__label">Thứ tự lượt</span><span className="side-card__value">Lượt {round.no}</span></div>
            <div className="side-card__item"><span className="side-card__label">Người trình · thời điểm</span><span className="side-card__value">{round.submittedByName} · {formatDateTime(round.submittedAt)}</span></div>
            <div className="side-card__item"><span className="side-card__label">Phiên bản hồ sơ được trình</span><span className="side-card__value">Phiên bản {round.contractVersion}</span></div>
            <div className="side-card__item"><span className="side-card__label">Cấu hình quy trình</span><span className="side-card__value">{round.configCode} · phiên bản {round.configVersion}</span></div>
            <div className="side-card__item"><span className="side-card__label">Trạng thái hồ sơ</span><StatusBadge label={CONTRACT_STATUS_BADGE[contract.status].label} tone={CONTRACT_STATUS_BADGE[contract.status].tone} /></div>
            <div className="side-card__item"><span className="side-card__label">Kết quả lượt</span><StatusBadge label={result.label} tone={result.tone} /></div>
          </section>
        </aside>
      </div>

      <section className="contract-results">
        <div className="contract-results__header contract-results__header--row">
          <div><h2>Lịch sử xử lý</h2><p>Nhật ký của lượt {round.no} theo thứ tự thời gian.</p></div>
          <div className="contract-log-filters">
            <select aria-label="Lọc theo bước" value={filter.step} onChange={(event) => onFilter({ ...filter, step: event.target.value as ApprovalStepKey | '' })}><option value="">Tất cả bước</option>{STEP_ORDER.map((key) => <option key={key} value={key}>{STEP_LABELS[key]}</option>)}</select>
            <select aria-label="Lọc theo hành động" value={filter.action} onChange={(event) => onFilter({ ...filter, action: event.target.value as ApprovalAction | '' })}><option value="">Tất cả hành động</option>{actions.map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}</select>
            <select aria-label="Lọc theo người thực hiện" value={filter.actor} onChange={(event) => onFilter({ ...filter, actor: event.target.value })}><option value="">Tất cả người thực hiện</option>{actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}</select>
            {filtered && <button type="button" className="contract-filters__reset" onClick={() => onFilter(EMPTY_FILTER)}>Xóa bộ lọc</button>}
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="contract-empty"><span className="contract-empty__icon"><Icon name="history" /></span><h3>Không có kết quả</h3><p>Không có dòng lịch sử nào thỏa điều kiện lọc.</p><Button variant="secondary" onClick={() => onFilter(EMPTY_FILTER)}>Xóa bộ lọc</Button></div>
        ) : (
          <div className="contract-log-wrap">
            <table className="contract-log">
              <thead><tr><th>Thời điểm</th><th>Bước</th><th>Người thực hiện</th><th>Hành động</th><th>Trạng thái trước → sau</th><th>Ý kiến / lý do</th><th>Phiên bản</th></tr></thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`}>
                    <td>{formatDateTime(entry.at)}</td>
                    <td>{STEP_LABELS[entry.stepKey]}</td>
                    <td>{entry.actorName}</td>
                    <td>{ACTION_LABELS[entry.action]}</td>
                    <td>{CONTRACT_STATUS_BADGE[entry.from].label} → {CONTRACT_STATUS_BADGE[entry.to].label}</td>
                    <td>{entry.internal && !canSeeInternal ? <span className="contract-log__hidden"><Icon name="eye-off" size={14} /> Ngoài phạm vi được xem</span> : entry.note ?? '—'}</td>
                    <td>{entry.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
