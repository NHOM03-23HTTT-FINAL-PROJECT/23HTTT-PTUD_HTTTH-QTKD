/*
 * Lưu phiên đăng nhập phía trình duyệt. "Ghi nhớ đăng nhập" → localStorage (giữ sau khi đóng
 * trình duyệt); không chọn → sessionStorage. Prototype chưa có JWT nên chỉ lưu định danh phiên.
 */
const SESSION_KEY = 'qtkd.session';

export type StoredSession = {
  userId: string;
  signedInAt: string;
  /** Lần thao tác cuối (epoch ms) – dùng để hủy phiên sau thời gian không thao tác, kể cả khi tải lại trang. */
  lastActiveAt: number;
};

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const sessionStore = {
  save(session: StoredSession, remember: boolean) {
    const target = safeStorage(remember ? 'local' : 'session');
    const other = safeStorage(remember ? 'session' : 'local');
    try {
      other?.removeItem(SESSION_KEY);
      target?.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Không lưu được thì phiên chỉ tồn tại trong bộ nhớ của tab hiện tại.
    }
  },

  load(): StoredSession | null {
    for (const kind of ['session', 'local'] as const) {
      try {
        const raw = safeStorage(kind)?.getItem(SESSION_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredSession;
          return { ...stored, lastActiveAt: stored.lastActiveAt ?? Date.parse(stored.signedInAt) };
        }
      } catch {
        // Bỏ qua dữ liệu hỏng.
      }
    }
    return null;
  },

  /** Cập nhật phiên ở đúng nơi đang lưu (localStorage hoặc sessionStorage). */
  update(patch: Partial<StoredSession>) {
    for (const kind of ['session', 'local'] as const) {
      try {
        const storage = safeStorage(kind);
        const raw = storage?.getItem(SESSION_KEY);
        if (raw) {
          storage?.setItem(SESSION_KEY, JSON.stringify({ ...(JSON.parse(raw) as StoredSession), ...patch }));
          return;
        }
      } catch {
        // Không cập nhật được thì vẫn dùng giá trị trong bộ nhớ.
      }
    }
  },

  /** Cập nhật lần thao tác cuối. */
  touch(lastActiveAt: number) {
    this.update({ lastActiveAt });
  },

  clear() {
    for (const kind of ['session', 'local'] as const) {
      try {
        safeStorage(kind)?.removeItem(SESSION_KEY);
      } catch {
        // Không có gì để xóa.
      }
    }
  },
};
