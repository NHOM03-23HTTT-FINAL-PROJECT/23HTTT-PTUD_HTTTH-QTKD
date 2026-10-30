import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/button/Button';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import type {
  ActivityItem,
  AreaTreeNode,
  ContractProgress,
  HeaderActions,
  PendingTasks,
  QuickLink,
  StatItem,
  WorkflowStep,
} from '../types/dashboard';
import './DashboardCards.css';

export function DashboardHeader({ name, greeting, actions }: { name: string; greeting: string; actions: HeaderActions }) {
  return (
    <div className="dash-header">
      <div className="dash-header__greeting">
        <h1 className="dash-header__title">Xin chào, {name}</h1>
        <p className="dash-header__subtitle">{greeting}</p>
      </div>
      {(actions.secondary || actions.primary) && (
        <div className="dash-header__actions">
          {actions.secondary && (
            <ButtonLink to={actions.secondary.to} variant="secondary">
              {actions.secondary.label}
            </ButtonLink>
          )}
          {actions.primary && <ButtonLink to={actions.primary.to}>{actions.primary.label}</ButtonLink>}
        </div>
      )}
    </div>
  );
}

/** Khối "Hồ sơ chờ tôi xử lý" kèm số thông báo chưa đọc. */
export function PendingTasksCard({ pending }: { pending: PendingTasks }) {
  const total = pending.items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="card pending-card" aria-label="Hồ sơ chờ tôi xử lý">
      <span className="icon-box icon-box--sm">
        <Icon name="inbox" />
      </span>
      <div className="pending-card__title">
        <p className="pending-card__heading">Hồ sơ chờ tôi xử lý</p>
        <p className="pending-card__count">{total > 0 ? `${total} việc cần xử lý` : 'Không có việc cần xử lý'}</p>
      </div>
      <div className="pending-card__items">
        {pending.items.length > 0
          ? pending.items.map((item) => (
              <span key={item.label} className="pending-card__chip">
                <strong>{item.count}</strong>
                {item.label}
              </span>
            ))
          : pending.emptyText && <p className="pending-card__empty">{pending.emptyText}</p>}
      </div>
      <span className="pending-card__unread">
        <Icon name="bell" />
        {pending.unread} thông báo chưa đọc
      </span>
      {pending.viewAllTo && (
        <ButtonLink to={pending.viewAllTo} variant="ghost">
          Xem tất cả
        </ButtonLink>
      )}
    </section>
  );
}

/** Stat Card theo component Figma 1:212. */
export function StatGrid({ stats }: { stats: StatItem[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="stat-grid">
      {stats.map((stat) => (
        <div key={stat.label} className="card stat-card">
          <div className="stat-card__text">
            <p className="stat-card__label">{stat.label}</p>
            <p className="stat-card__value">{stat.value}</p>
            <p className="stat-card__hint">{stat.hint}</p>
          </div>
          <span className="icon-box icon-box--lg">
            <Icon name={stat.icon} />
          </span>
        </div>
      ))}
    </div>
  );
}

type CardProps = {
  title: string;
  subtitle?: string;
  viewAllTo?: string;
  children: ReactNode;
  className?: string;
};

/** Thẻ có tiêu đề dùng cho bảng (Table/...) – phần thân không có lề để bảng tràn viền. */
export function TableCard({ title, subtitle, viewAllTo, children }: CardProps) {
  return (
    <section className="card table-card">
      <div className="table-card__header">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {viewAllTo && (
          <ButtonLink to={viewAllTo} variant="ghost">
            Xem tất cả
          </ButtonLink>
        )}
      </div>
      {children}
    </section>
  );
}

/** Thẻ nội dung có lề 16px (Card/... ở cột phụ). */
export function PanelCard({ title, subtitle, children, className }: CardProps) {
  return (
    <section className={className ? `card panel-card ${className}` : 'card panel-card'}>
      <div className="panel-card__header">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function QuickLinksCard({ links }: { links: QuickLink[] }) {
  return (
    <PanelCard title="Truy cập nhanh" className="quick-links">
      {links.map((link) => (
        <Link key={link.label} to={link.to} className="quick-link">
          <span className="icon-box icon-box--md">
            <Icon name={link.icon} />
          </span>
          <span className="quick-link__label">{link.label}</span>
          <Icon name="arrow-right" className="quick-link__arrow" />
        </Link>
      ))}
    </PanelCard>
  );
}

export function ProgressCard({ progress }: { progress: ContractProgress }) {
  return (
    <PanelCard title={`Tiến độ ${progress.code}`} subtitle={progress.customer} className="progress-card">
      {progress.steps.map((step, index) => (
        <div key={step.title} className="progress-step">
          <span className={`progress-step__number progress-step__number--${step.state}`}>{index + 1}</span>
          <div className="progress-step__text">
            <p className="progress-step__title">{step.title}</p>
            <p className="progress-step__meta">{step.meta}</p>
          </div>
          <StatusBadge label={step.badge.label} tone={step.badge.tone} />
        </div>
      ))}
    </PanelCard>
  );
}

export function ActivityCard({ title, items }: { title: string; items: ActivityItem[] }) {
  return (
    <PanelCard title={title} className="activity-card">
      {items.map((item) => (
        <div key={item.title} className="activity-item">
          <span className={`activity-item__dot activity-item__dot--${item.tone}`} />
          <div className="activity-item__text">
            <p className="activity-item__title">{item.title}</p>
            <p className="activity-item__meta">{item.meta}</p>
          </div>
        </div>
      ))}
    </PanelCard>
  );
}

const TREE_ICON = ['building', 'layers', 'map-pin'] as const;

export function AreaTreeCard({ nodes }: { nodes: AreaTreeNode[] }) {
  return (
    <PanelCard title="Sơ đồ phân cấp mặt bằng" subtitle="Cảng → Bến/Bãi → Ô/Vị trí" className="area-tree">
      {nodes.map((node) => (
        <div
          key={node.name}
          className={node.depth === 0 ? 'area-tree__node area-tree__node--root' : 'area-tree__node'}
          style={{ paddingLeft: node.depth * 22 }}
        >
          <Icon name={TREE_ICON[node.depth]} />
          <span className="area-tree__name">{node.name}</span>
          {node.badge && <StatusBadge label={node.badge.label} tone={node.badge.tone} />}
        </div>
      ))}
    </PanelCard>
  );
}

export function WorkflowCard({
  title,
  version,
  steps,
  editTo,
}: {
  title: string;
  version: string;
  steps: WorkflowStep[];
  editTo: string;
}) {
  return (
    <PanelCard title={title} subtitle={version} className="workflow-card">
      <div>
        {steps.map((step, index) => (
          <div key={step.title} className="workflow-step">
            <div className="workflow-step__rail">
              <span className="workflow-step__number">{index + 1}</span>
              {index < steps.length - 1 && <span className="workflow-step__line" />}
            </div>
            <div className="workflow-step__text">
              <p className="progress-step__title">{step.title}</p>
              <p className="progress-step__meta">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="panel-card__footer">
        <ButtonLink to={editTo} variant="secondary">
          Chỉnh sửa cấu hình
        </ButtonLink>
      </div>
    </PanelCard>
  );
}
