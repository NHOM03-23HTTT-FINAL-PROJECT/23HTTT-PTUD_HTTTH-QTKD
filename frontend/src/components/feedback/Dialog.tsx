import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/icon/Icon';
import './Dialog.css';

type DialogProps = {
  title: string;
  icon: IconName;
  tone?: 'warning' | 'danger' | 'info';
  width?: number;
  /** Nút được focus khi mở: hộp thoại có hành động phá hủy nên focus nút an toàn (đầu tiên). */
  initialFocus?: 'first' | 'last';
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
};

/**
 * Hộp thoại xác nhận theo frame 03.1 / 03.2: lớp phủ, biểu tượng tròn, tiêu đề, nút đóng và nhóm nút
 * canh phải. Esc hoặc nút × gọi `onClose`; Tab được giữ trong hộp thoại.
 */
export function Dialog({
  title,
  icon,
  tone = 'warning',
  width = 460,
  initialFocus = 'last',
  onClose,
  children,
  actions,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Giữ onClose mới nhất mà không chạy lại effect (tránh đặt lại focus mỗi lần render, ví dụ khi đếm ngược).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const buttons = panel?.querySelectorAll<HTMLElement>('.dialog__actions button, .dialog__actions a');
    buttons?.[initialFocus === 'first' ? 0 : buttons.length - 1]?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previous?.focus?.();
    };
    // Chỉ chạy khi mở/đóng hộp thoại.
  }, []);

  return createPortal(
    <div className="dialog-layer">
      <div className="dialog-overlay" onClick={onClose} />
      <div ref={panelRef} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} style={{ width }}>
        <div className="dialog__header">
          <span className={`dialog__icon dialog__icon--${tone}`}>
            <Icon name={icon} />
          </span>
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button type="button" className="dialog__close" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </div>
        {children}
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
