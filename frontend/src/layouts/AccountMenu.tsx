import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Icon } from '@/components/icon/Icon';
import { ACCOUNT_NAV } from '@/constants/navigation';
import { formatTimeDate, initials } from '@/utils/format';
import './AccountMenu.css';

/**
 * Menu tài khoản trên Topbar (frame 03.0 · Mở menu tài khoản): họ tên, vai trò, phòng ban,
 * thời điểm đăng nhập kèm "Thông tin cá nhân", "Đổi mật khẩu" và "Đăng xuất".
 */
export function AccountMenu({ user }: { user: CurrentUser }) {
  const { requestLogout } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    requestLogout();
  }

  const userInitials = initials(user.fullName);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="topbar__user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="topbar__avatar">{userInitials}</span>
        <span className="topbar__user-info">
          <span className="topbar__user-name">{user.fullName}</span>
          <span className="topbar__user-role">{user.primaryRole.name}</span>
        </span>
        <Icon name="chevron" className={open ? 'topbar__chevron topbar__chevron--open' : 'topbar__chevron'} />
      </button>

      {open && (
        <div id={menuId} className="account-menu__panel" role="menu" aria-label="Menu tài khoản">
          <div className="account-menu__account">
            <span className="topbar__avatar">{userInitials}</span>
            <div className="account-menu__identity">
              <p className="account-menu__name">{user.fullName}</p>
              <p className="account-menu__role">
                {user.primaryRole.name} · {user.departmentInfo.name}
              </p>
              <p className="account-menu__signed-in">Đăng nhập lúc {formatTimeDate(user.signedInAt)}</p>
            </div>
          </div>
          <hr className="account-menu__divider" />
          <Link to={ACCOUNT_NAV.profile.path} role="menuitem" className="account-menu__item" onClick={() => setOpen(false)}>
            <Icon name="user" />
            {ACCOUNT_NAV.profile.label}
          </Link>
          <Link
            to={ACCOUNT_NAV.changePassword.path}
            role="menuitem"
            className="account-menu__item"
            onClick={() => setOpen(false)}
          >
            <Icon name="lock" />
            {ACCOUNT_NAV.changePassword.label}
          </Link>
          <hr className="account-menu__divider" />
          <button type="button" role="menuitem" className="account-menu__item account-menu__item--danger" onClick={handleLogout}>
            <Icon name="logout" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
