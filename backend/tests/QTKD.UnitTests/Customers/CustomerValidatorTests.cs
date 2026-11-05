using QTKD.Application.Features.Customers;
using Xunit;

namespace QTKD.UnitTests.Customers;

public sealed class CustomerValidatorTests
{
    private static CustomerDraft Valid => new(" Khách hàng ", "0123456789", " Địa chỉ ", " Nguyễn An ",
        "", "", "0900000000", "", "XNK", ["BOC_XEP"]);

    [Fact]
    public void Normalizes_fields_and_accepts_a_contact_by_either_phone_or_email()
    {
        var normalized = CustomerValidator.Validate(Valid);
        Assert.Equal("Khách hàng", normalized.Name); Assert.Equal("Địa chỉ", normalized.Address);
        Assert.Equal("Nguyễn An", normalized.Representative);
        Assert.Equal("test@example.invalid", CustomerValidator.Validate(Valid with { Phone = "", Email = " test@example.invalid " }).Email);
        Assert.Equal("0123456789012", CustomerValidator.Validate(Valid with { TaxCode = "0123456789012" }).TaxCode);
    }

    [Theory]
    [InlineData("name")] [InlineData("address")] [InlineData("representative")] [InlineData("tax")]
    [InlineData("contact")] [InlineData("phone")] [InlineData("email")] [InlineData("group")]
    [InlineData("services")] [InlineData("repeated-services")] [InlineData("name-length")]
    public void Rejects_invalid_customer_data(string field)
    {
        var invalid = field switch
        {
            "name" => Valid with { Name = " " }, "address" => Valid with { Address = "" },
            "representative" => Valid with { Representative = "" }, "tax" => Valid with { TaxCode = "123" },
            "contact" => Valid with { Phone = "", Email = "" }, "phone" => Valid with { Phone = "090 abc" },
            "email" => Valid with { Email = "not-an-email" }, "group" => Valid with { CustomerGroup = "UNKNOWN" },
            "services" => Valid with { ServiceGroups = ["UNKNOWN"] }, "repeated-services" => Valid with { ServiceGroups = ["BOC_XEP", "BOC_XEP"] },
            _ => Valid with { Name = new string('x', 251) }
        };
        Assert.Equal("VALIDATION", Assert.Throws<CustomerFailure>(() => CustomerValidator.Validate(invalid)).Code);
    }

    [Fact]
    public void Editing_preserves_legacy_tax_and_customer_group_without_allowing_new_unknown_groups()
    {
        var input = Valid with { TaxCode = null, CustomerGroup = "Nhóm khách cũ" };
        Assert.Equal("0987654321", CustomerValidator.Validate(input, "0987654321", "Nhóm khách cũ").TaxCode);
        Assert.Equal("VALIDATION", Assert.Throws<CustomerFailure>(() => CustomerValidator.Validate(input, "0987654321")).Code);
    }

    [Theory]
    [InlineData("")] [InlineData(" ")] [InlineData("key with spaces")] [InlineData("key\nline")]
    public void Rejects_missing_or_unsafe_idempotency_keys(string key) =>
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", Assert.Throws<CustomerFailure>(() => CustomerValidator.Key(key)).Code);

    [Fact]
    public void Accepts_retry_key_but_limits_its_size()
    {
        CustomerValidator.Key(Guid.NewGuid().ToString());
        Assert.Throws<CustomerFailure>(() => CustomerValidator.Key(new string('k', 101)));
    }
}
