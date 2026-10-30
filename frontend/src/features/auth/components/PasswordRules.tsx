import { Icon } from '@/components/icon/Icon';
import { checkPolicy, passwordStrength, POLICY_RULES, type PolicyRuleId } from '../utils/passwordPolicy';
import './PasswordRules.css';

/** Chỉ báo độ mạnh mật khẩu theo thời gian thực (frame 02.8 / 02.9). */
export function PasswordStrength({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (strength.level === 0) return null;

  return (
    <div className={`strength strength--${strength.tone}`} aria-live="polite">
      <div className="strength__bars">
        {[1, 2, 3, 4].map((bar) => (
          <span key={bar} className={bar <= strength.level ? 'strength__bar strength__bar--on' : 'strength__bar'} />
        ))}
      </div>
      <p className="strength__label">Độ mạnh: {strength.label}</p>
    </div>
  );
}

export type RuleState = 'pass' | 'fail' | 'pending';

type PasswordPolicyProps = {
  password: string;
  /**
   * Tiêu chí so với mật khẩu hiện tại. Quên mật khẩu (02.x): chỉ server biết nên "pending" tới khi bị từ chối.
   * Đổi mật khẩu (04.x): người dùng tự nhập mật khẩu hiện tại nên so sánh được ngay.
   */
  notCurrent: { label: string; state: RuleState };
};

/** Chính sách mật khẩu với tiêu chí đạt/chưa đạt theo thời gian thực. */
export function PasswordPolicy({ password, notCurrent }: PasswordPolicyProps) {
  const checks = checkPolicy(password);
  const rules: { id: PolicyRuleId; label: string; state: RuleState }[] = [
    ...POLICY_RULES.map((rule) => ({
      ...rule,
      state: (!password ? 'pending' : checks[rule.id] ? 'pass' : 'fail') as RuleState,
    })),
    { id: 'notCurrent', ...notCurrent },
  ];

  return (
    <div className="policy">
      <p className="policy__title">Chính sách mật khẩu</p>
      <ul className="policy__rules">
        {rules.map((rule) => {
          const state = rule.state;
          return (
            <li key={rule.id} className={`policy__rule policy__rule--${state}`}>
              <Icon name={state === 'fail' ? 'x' : 'check'} size={16} />
              {rule.label}
              <span className="visually-hidden">
                {state === 'pass' ? ' – đạt' : state === 'fail' ? ' – chưa đạt' : ' – kiểm tra khi lưu'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
