import { useContext } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { Button } from '@/components/button/Button';
import { Dialog } from '@/components/feedback/Dialog';
import { ROUTES } from '@/constants/routes';

type Props = { dirty: boolean; bypass: { current: boolean } };

/** Only customer create/edit forms register this guard. Static route previews have no history to block. */
export function CustomerNavigationGuard(props: Props) {
  const router = useContext(UNSAFE_DataRouterContext);
  return router ? <NavigationGuard {...props} /> : null;
}

function NavigationGuard({ dirty, bypass }: Props) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    // Session expiry/permission changes must always finish authentication cleanup.
    if (nextLocation.pathname === ROUTES.login || nextLocation.pathname === ROUTES.forcedPasswordChange) return false;
    return dirty && !bypass.current &&
      currentLocation.pathname + currentLocation.search + currentLocation.hash !==
      nextLocation.pathname + nextLocation.search + nextLocation.hash;
  });
  if (blocker.state !== 'blocked') return null;
  return <Dialog title="Bạn có thay đổi chưa lưu" width={480} initialFocus="first"
    onClose={() => blocker.reset()}
    actions={<>
      <Button variant="secondary" onClick={() => blocker.reset()}>Tiếp tục chỉnh sửa</Button>
      <Button variant="danger" onClick={() => { bypass.current = true; blocker.proceed(); }}>Rời trang</Button>
    </>}>
    <p className="dialog__body">Rời trang sẽ bỏ những thay đổi chưa lưu. Dữ liệu đã lưu của khách hàng được giữ nguyên.</p>
  </Dialog>;
}
