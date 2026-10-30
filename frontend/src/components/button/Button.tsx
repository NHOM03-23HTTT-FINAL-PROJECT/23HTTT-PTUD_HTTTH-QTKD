import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type CommonProps = {
  variant?: Variant;
  block?: boolean;
  className?: string;
};

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

function buttonClass({ variant = 'primary', block, className }: CommonProps) {
  return ['btn', `btn--${variant}`, block && 'btn--block', className].filter(Boolean).join(' ');
}

/** Button theo component Figma 1:192 – Primary dùng accent-strong của phân hệ. */
export function Button({ variant, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, block, className })} {...rest} />;
}

type ButtonLinkProps = CommonProps & {
  to: string;
  children: ReactNode;
};

export function ButtonLink({ to, variant, block, className, children }: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass({ variant, block, className })}>
      {children}
    </Link>
  );
}
