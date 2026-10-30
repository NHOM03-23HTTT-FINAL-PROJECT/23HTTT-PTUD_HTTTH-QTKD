import { Fragment } from 'react';
import { Icon } from '@/components/icon/Icon';
import './RecoveryStepper.css';

const STEPS = ['Nhập tài khoản', 'Nhập mã OTP', 'Mật khẩu mới'];

/** Chỉ báo tiến trình 3 bước của UC-CHUNG-02 (NFR-04). `current` tính từ 0. */
export function RecoveryStepper({ current }: { current: number }) {
  return (
    <ol className="stepper" aria-label="Các bước đặt lại mật khẩu">
      {STEPS.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        return (
          <Fragment key={label}>
            {index > 0 && <li aria-hidden className={index <= current ? 'stepper__line stepper__line--done' : 'stepper__line'} />}
            <li className={`stepper__step stepper__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="stepper__dot">{state === 'done' ? <Icon name="check" size={14} /> : index + 1}</span>
              {label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
