import type { ReactNode } from 'react';

type FormSectionProps = {
  title: string;
  description?: string;
  /** Lưới 2 cột (mặc định) hoặc một cột cho ô nhiều dòng. */
  layout?: 'grid' | 'stack';
  children: ReactNode;
};

/** Một nhóm trên biểu mẫu khách hàng: tiêu đề, mô tả và các trường (frame 01.1 / 02.1). */
export function FormSection({ title, description, layout = 'grid', children }: FormSectionProps) {
  return (
    <section className="customer-form__section">
      <div className="customer-card__heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className={layout === 'grid' ? 'customer-form__grid' : 'customer-form__stack'}>{children}</div>
    </section>
  );
}
