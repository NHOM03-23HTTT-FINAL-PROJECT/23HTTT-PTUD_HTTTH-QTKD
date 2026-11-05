namespace QTKD.Application.Features.Identity;

public sealed record SendOtpRequest(string? Identifier);
public sealed record VerifyOtpRequest(string? Identifier, string? Code);
public sealed record ResetPasswordRequest(string? ResetToken, string? NewPassword);
public sealed record OtpDispatch(long ExpiresAt, long ResendAvailableAt);
public sealed record VerifyOtpResult(string ResetToken, string AccountLabel);
public sealed record ResetPasswordResult(string Identifier);
