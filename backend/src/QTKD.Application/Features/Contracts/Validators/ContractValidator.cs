using System.Globalization;
using System.Text.RegularExpressions;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public static class ContractValidator
{
    public static decimal Validate(ContractDraft draft)
    {
        var errors = new Dictionary<string, object>();

        void Required(string key, string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > max)
            {
                errors[key] = $"Thông tin bắt buộc, tối đa {max} ký tự.";
            }
        }

        Required("customerCode", draft.CustomerCode, 80);
        Required("title", draft.Title, 500);
        Required("contractType", draft.ContractType, 100);
        Required("paymentTerm", draft.PaymentTerm, 10000);
        Required("content", draft.Content, 200000);

        if (draft.SourceMode is not ("template" or "blank"))
        {
            errors["sourceMode"] = "Cách lập hồ sơ không hợp lệ.";
        }

        if (draft.SourceMode == "template")
        {
            Required("templateCode", draft.TemplateCode, 80);
        }

        var validStart = DateOnly.TryParseExact(
            draft.EffectiveFrom,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var start);

        var validEnd = DateOnly.TryParseExact(
            draft.EffectiveTo,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var end);

        if (!validStart)
        {
            errors["effectiveFrom"] = "Ngày bắt đầu không hợp lệ.";
        }

        if (!validEnd || (validStart && end < start))
        {
            errors["effectiveTo"] = "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.";
        }

        var raw = (draft.Value ?? "").Trim();
        // FE formats VND using grouping dots; reject signs, exponents and malformed separators.
        if (!Regex.IsMatch(raw, @"^(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)$") ||
            !decimal.TryParse(raw.Replace(".", ""), NumberStyles.None, CultureInfo.InvariantCulture, out var value) ||
            value <= 0 ||
            value > 9007199254740991m)
        {
            value = 0;
            errors["value"] = "Giá trị hợp đồng phải là số nguyên dương trong giới hạn cho phép.";
        }

        if (draft.Services is null || draft.Services.Length is < 1 or > 100)
        {
            errors["services"] = "Cần từ 1 đến 100 hạng mục dịch vụ.";
        }
        else
        {
            if (draft.Services.Any(s => s is null || string.IsNullOrWhiteSpace(s.Id) || string.IsNullOrWhiteSpace(s.ServiceCode)) ||
                draft.Services.Select(s => s.Id).Distinct().Count() != draft.Services.Length ||
                draft.Services.Select(s => (s.ServiceCode, s.AreaCode)).Distinct().Count() != draft.Services.Length)
            {
                errors["services"] = "Hạng mục dịch vụ không hợp lệ hoặc bị trùng.";
            }
            else
            {
                var missing = draft.Services
                    .Where(s => s.RequiresArea && string.IsNullOrWhiteSpace(s.AreaCode))
                    .ToDictionary(s => s.Id, _ => "Chọn khu vực đang Hoạt động.");

                if (missing.Count > 0)
                {
                    errors["serviceAreas"] = missing;
                }
            }
        }

        if (errors.Count > 0)
        {
            throw new BusinessException("VALIDATION", 422, new
            {
                fieldErrors = errors
            });
        }

        return value;
    }

    public static string Reason(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length > 4000)
        {
            throw new BusinessException("VALIDATION", 422);
        }

        return value.Trim();
    }
}
