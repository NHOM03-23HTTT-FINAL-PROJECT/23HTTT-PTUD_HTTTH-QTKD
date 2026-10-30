import { Icon } from '@/components/icon/Icon';
import './RememberCheckbox.css';

type RememberCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function RememberCheckbox({ checked, onChange, disabled }: RememberCheckboxProps) {
  return (
    <label className={disabled ? 'login-remember login-remember--disabled' : 'login-remember'}>
      <input
        type="checkbox"
        className="visually-hidden"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={checked ? 'login-remember__box login-remember__box--checked' : 'login-remember__box'} aria-hidden>
        {checked && <Icon name="check" size={14} />}
      </span>
      Ghi nhớ đăng nhập
    </label>
  );
}
