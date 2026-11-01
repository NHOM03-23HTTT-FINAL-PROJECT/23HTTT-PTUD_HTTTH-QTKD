# API Xác thực (UC-CHUNG-01 → 04)

Nguồn: `frontend/src/features/auth/api/authApi.ts`, `passwordRecoveryApi.ts` và `frontend/src/mocks/authServer.ts`, `passwordRecoveryServer.ts`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

> Endpoint là đề xuất từ chữ ký hàm FE, chưa đối chiếu đặc tả UC chi tiết và chưa được nhóm BE chốt.

| Method | Endpoint | UC | Hàm FE | Ghi chú |
|---|---|---|---|---|
| POST | `/auth/login` | CHUNG-01 | `authApi.login` | `{identifier, password}` → token, user, `previousLogin`; mật khẩu tạm thì bắt buộc đổi (A2) |
| GET | `/auth/session` | CHUNG-03 A3 | `authApi.checkSession` | `active` / `password-changed` / `locked` / `disabled` / `no-role` |
| POST | `/auth/logout` | CHUNG-03 | `authApi.logout` | `{reason: logout \| expired}` |
| POST | `/auth/password/change` | CHUNG-04 | `authApi.changePassword` | `{currentPassword, newPassword}` → token mới, `passwordChangedAt`; các phiên khác bị thu hồi |
| GET | `/auth/password/changed-at` | CHUNG-04 | `authApi.getPasswordChangedAt` | Có thể gộp vào `/auth/session` |
| POST | `/auth/password-recovery/otp` | CHUNG-02 | `passwordRecoveryApi.sendOtp` | `{identifier}` → `expiresAt`, `resendAvailableAt`; phản hồi như nhau dù tài khoản có tồn tại hay không |
| POST | `/auth/password-recovery/otp/verify` | CHUNG-02 | `passwordRecoveryApi.verifyOtp` | `{identifier, code}` → `resetToken`, `accountLabel` |
| POST | `/auth/password-recovery/reset` | CHUNG-02 | `passwordRecoveryApi.resetPassword` | `{resetToken, newPassword}` |

## Chưa có trong code

Quản lý người dùng, phòng ban, vai trò, quyền (TASK-021..028) chưa có FE (`features/users/` mới có `.gitkeep`), nên chưa có API trong danh sách này.
