import { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { Alert } from '@/components/feedback/Alert';
import { Button } from '@/components/button/Button';
import { ROUTES } from '@/constants/routes';
import { approvalApi } from '../api/approvalApi';
import { approvalError, approvalPermission } from '../utils/approvalReview';
export { approvalError } from '../utils/approvalReview';

/** Preserve old UUID inbox links; all review actions now live on the canonical contract detail. */
export function ContractReviewPage() {
  const { id = '' } = useParams();
  const [query] = useSearchParams();
  const { user, can } = useAuth();
  const raw = query.get('step');
  const step = raw === 'sales' || raw === 'legal' || raw === 'board' ? raw : null;
  const allowed = Boolean(!IS_MOCK_AUTH && step && can(approvalPermission(step)));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setCode(''); setError('');
    if (!allowed || !step) return;
    approvalApi.read(id, step, abort.signal).then(d => {
      if (abort.signal.aborted) return;
      if (d.code) setCode(d.code); else setError('Chưa tải được mã hợp đồng. Hãy mở lại hồ sơ từ danh sách sau khi cập nhật API.');
    }).catch(e => { if (!abort.signal.aborted) setError(approvalError(e)); });
    return () => abort.abort();
  }, [id, step, allowed, user?.id, reload]);
  if (!allowed) return <Alert tone="danger" title="Không có quyền rà soát">Mở hồ sơ được giao từ danh sách phê duyệt theo vai trò của bạn.</Alert>;
  if (code) return <Navigate replace to={ROUTES.contractDetail(code)} />;
  if (error) return <Alert tone="danger" title="Chưa mở được hồ sơ" action={<Button variant="secondary" onClick={() => setReload(n => n + 1)}>Tải lại</Button>}>{error}</Alert>;
  return <p role="status">Đang mở hồ sơ hợp đồng để rà soát…</p>;
}
