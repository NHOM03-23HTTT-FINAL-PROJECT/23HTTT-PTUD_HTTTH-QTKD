using System.Text.RegularExpressions;

namespace QTKD.Application.Features.Customers;

public static class CustomerValidator
{
    private static readonly HashSet<string> Groups = ["XNK", "HANG_TAU", "SAN_XUAT", "FORWARDER", "THUONG_MAI"];
    private static readonly HashSet<string> Services = ["LUU_KHO", "BOC_XEP", "VAN_CHUYEN_ND", "KHAI_THAC_CANG", "VAN_HANH_TB"];
    public static CustomerDraft Validate(CustomerDraft? draft, string? taxCode = null, string? legacyGroup = null)
    {
        if (draft is null) throw new CustomerFailure(400, "VALIDATION");
        static string Clean(string? s) => (s ?? "").Trim();
        var d = draft with { Name = Clean(draft.Name), TaxCode = Clean(taxCode ?? draft.TaxCode), Address = Clean(draft.Address),
            Representative = Clean(draft.Representative), ContactName = Clean(draft.ContactName), ContactTitle = Clean(draft.ContactTitle),
            Phone = Clean(draft.Phone), Email = Clean(draft.Email), CustomerGroup = Clean(draft.CustomerGroup),
            ServiceGroups = draft.ServiceGroups ?? [] };
        if (d.Name.Length is < 1 or > 250 || d.Address.Length is < 1 or > 5000 || d.Representative.Length is < 1 or > 200
            || !Regex.IsMatch(d.TaxCode, "^(?:[0-9]{10}|[0-9]{13})$") || d.ContactName.Length > 200 || d.ContactTitle.Length > 150
            || d.Phone.Length > 30 || d.Email.Length > 254 || (d.Phone.Length == 0 && d.Email.Length == 0)
            || (d.Phone.Length > 0 && !Regex.IsMatch(d.Phone, "^\\+?[0-9]+$"))
            || (d.Email.Length > 0 && !Regex.IsMatch(d.Email, "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            || (d.CustomerGroup.Length > 0 && !Groups.Contains(d.CustomerGroup) && d.CustomerGroup != legacyGroup)
            || d.ServiceGroups.Length > Services.Count || d.ServiceGroups.Any(s => s is null || !Services.Contains(s))
            || d.ServiceGroups.Distinct(StringComparer.Ordinal).Count() != d.ServiceGroups.Length)
            throw new CustomerFailure(400, "VALIDATION");
        return d;
    }
    public static void Key(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100 || key.Any(ch => ch < 33 || ch > 126))
            throw new CustomerFailure(400, "IDEMPOTENCY_KEY_REQUIRED");
    }
}
