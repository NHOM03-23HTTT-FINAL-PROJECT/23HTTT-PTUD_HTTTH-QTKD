/*
 * Thời gian phiên theo UC-CHUNG-03: tự hủy sau 30 phút không thao tác, cảnh báo trước 2 phút (NFR-04).
 * Có thể rút ngắn khi kiểm thử bằng biến môi trường VITE_SESSION_IDLE_MINUTES (ví dụ 3).
 */
const configuredMinutes = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES);

export const SESSION_IDLE_MS = (configuredMinutes > 0 ? configuredMinutes : 30) * 60 * 1000;

/** Cảnh báo trước 2 phút; nếu thời gian phiên quá ngắn thì cảnh báo ở nửa sau. */
export const SESSION_WARNING_MS = Math.min(2 * 60 * 1000, SESSION_IDLE_MS / 2);
