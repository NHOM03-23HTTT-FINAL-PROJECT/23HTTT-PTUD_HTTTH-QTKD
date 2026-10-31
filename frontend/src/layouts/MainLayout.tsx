import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type CurrentUser } from '@/app/providers/AuthProvider';
import { SessionProvider } from '@/app/providers/SessionProvider';
import { Icon } from '@/components/icon/Icon';
import { WORKSPACE_NAV, WORKSPACE_SEARCH_PLACEHOLDER, type NavItem } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { getUnreadCount } from '@/mocks/seed/dashboards';
import { AccountMenu } from './AccountMenu';
import './MainLayout.css';

/** App shell sau đăng nhập: Topbar + Sidebar theo vai trò + vùng làm việc (frame 05.x). */
export function MainLayout() {
  const { user } = useAuth();
  if (!user) return null;
  const workspace = user.departmentInfo.workspace;

  return (
    <SessionProvider user={user}>
      <div className="app-shell" data-accent={workspace}>
        <Topbar user={user} />
        <div className="app-shell__body">
          <Sidebar user={user} />
          <main className="app-shell__workspace">
            <Outlet />
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}

function Topbar({ user }: { user: CurrentUser }) {
  const workspace = user.departmentInfo.workspace;
  const hasUnread = getUnreadCount(workspace) > 0;

  return (
    <header className="topbar">
      <NavLink to={ROUTES.dashboard} className="topbar__logo">
        <span className="topbar__mark">
          <Icon name="layers" />
        </span>
        <span>
          <span className="topbar__brand">ABC Logistics</span>
          <span className="topbar__product">ERP Quản trị kinh doanh</span>
        </span>
      </NavLink>

      <label className="topbar__search">
        <Icon name="search" />
        <span className="visually-hidden">Tìm kiếm</span>
        <input type="search" placeholder={WORKSPACE_SEARCH_PLACEHOLDER[workspace]} />
      </label>

      <div className="topbar__spacer" />

      <span className="topbar__module">
        <span className="topbar__module-dot" />
        {user.departmentInfo.name}
      </span>

      <button type="button" className="topbar__icon-button" aria-label="Thông báo">
        <Icon name="bell" />
        {hasUnread && <span className="topbar__unread" />}
      </button>

      <span className="topbar__divider" />

      <AccountMenu user={user} />
    </header>
  );
}

/** "Đổi mật khẩu" và "Đăng xuất" nằm trong menu tài khoản trên Topbar, không lặp lại ở Sidebar. */
function Sidebar({ user }: { user: CurrentUser }) {
  const areaRecordNavPath = user.departmentInfo.workspace === 'khai-thac' ? ROUTES.areas : ROUTES.areaLookup;
  const groups = WORKSPACE_NAV[user.departmentInfo.workspace]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || user.permissions.has(item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="sidebar" aria-label="Điều hướng chính">
      <p className="sidebar__group">TỔNG QUAN</p>
      <SidebarLink item={{ label: 'Bảng điều khiển', path: ROUTES.dashboard, icon: 'grid', module: '' }} />

      {groups.map((group) => (
        <div key={group.title} className="sidebar__section">
          <p className="sidebar__group">{group.title}</p>
          {group.items.map((item) => (
            <SidebarLink
              key={item.path}
              item={item}
              activeForAreaRecord={item.path === areaRecordNavPath}
              activeForContractRecord={item.path === ROUTES.contracts}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * Khớp chính xác các màn menu để "/khu-vuc" không sáng ở "/khu-vuc/so-do"; riêng hồ sơ động giữ sáng mục đã dẫn
 * người dùng tới hồ sơ (Danh sách với Phòng Khai thác, Tra cứu với các phòng chỉ xem).
 */
function SidebarLink({
  item,
  activeForAreaRecord = false,
  activeForContractRecord = false,
}: {
  item: NavItem;
  activeForAreaRecord?: boolean;
  activeForContractRecord?: boolean;
}) {
  const { pathname } = useLocation();
  const reservedAreaPaths = new Set<string>([ROUTES.areaCreate, ROUTES.areaHierarchy, ROUTES.areaLookup]);
  const isAreaRecord =
    activeForAreaRecord &&
    !reservedAreaPaths.has(pathname) &&
    /^\/khu-vuc\/[^/]+(?:\/chinh-sua)?$/.test(pathname);
  const isContractRecord = activeForContractRecord && /^\/hop-dong\/HD-\d{4}-\d{3,}$/.test(pathname);

  return (
    <NavLink
      to={item.path}
      end
      className={({ isActive }) =>
        isActive || isAreaRecord || isContractRecord ? 'sidebar__item sidebar__item--active' : 'sidebar__item'
      }
    >
      <Icon name={item.icon} />
      <span className="sidebar__label">{item.label}</span>
      {item.badge ? <span className="sidebar__badge">{item.badge}</span> : null}
    </NavLink>
  );
}
