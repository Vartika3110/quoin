import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { addressLabelText, formatAddressLines, resolveShipContact } = await import(
  "@/lib/addresses/format"
);

describe("addressLabelText", () => {
  it("shows SITE as 'Project site' to customers, not the enum name", () => {
    assert.equal(addressLabelText("SITE"), "Project site");
  });

  it("covers every label the schema allows", () => {
    assert.equal(addressLabelText("HOME"), "Home");
    assert.equal(addressLabelText("WORK"), "Work");
    assert.equal(addressLabelText("OTHER"), "Other");
  });
});

describe("formatAddressLines", () => {
  const base = {
    line1: "12 Elm Street",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500032",
  };

  it("joins line1 and line2, with the landmark in parentheses", () => {
    const [line] = formatAddressLines({ ...base, line2: "Near the water tank", landmark: "Opposite the school" });
    assert.equal(line, "12 Elm Street, Near the water tank (Opposite the school)");
  });

  it("drops line2 and the landmark entirely when neither is set", () => {
    const [line] = formatAddressLines(base);
    assert.equal(line, "12 Elm Street");
  });

  it("treats a blank line2 or landmark the same as an absent one", () => {
    const [line] = formatAddressLines({ ...base, line2: "   ", landmark: "" });
    assert.equal(line, "12 Elm Street");
  });

  it("puts city, state and PIN on the second line", () => {
    const [, cityLine] = formatAddressLines(base);
    assert.equal(cityLine, "Hyderabad, Telangana 500032");
  });
});

describe("resolveShipContact", () => {
  it("prefers the address's own recipient over the account", () => {
    const result = resolveShipContact({
      recipientName: "Site Supervisor",
      recipientPhone: "+919876543210",
      userName: "Account Holder",
      accountPhone: "+911234567890",
    });
    assert.deepEqual(result, { shipName: "Site Supervisor", shipPhone: "+919876543210" });
  });

  it("falls back to the account name, then the resolved phone, when no recipient name is saved", () => {
    const withAccountName = resolveShipContact({
      recipientName: null,
      recipientPhone: null,
      userName: "Account Holder",
      accountPhone: "+911234567890",
    });
    assert.deepEqual(withAccountName, { shipName: "Account Holder", shipPhone: "+911234567890" });

    const withNeither = resolveShipContact({
      recipientName: null,
      recipientPhone: null,
      userName: null,
      accountPhone: "+911234567890",
    });
    assert.deepEqual(withNeither, { shipName: "+911234567890", shipPhone: "+911234567890" });
  });

  it("falls back to the account phone when only the recipient name was saved", () => {
    const result = resolveShipContact({
      recipientName: "Site Supervisor",
      recipientPhone: null,
      userName: "Account Holder",
      accountPhone: "+911234567890",
    });
    assert.deepEqual(result, { shipName: "Site Supervisor", shipPhone: "+911234567890" });
  });

  it("treats a cleared (blank) field the same as one never saved", () => {
    const result = resolveShipContact({
      recipientName: "   ",
      recipientPhone: "",
      userName: "Account Holder",
      accountPhone: "+911234567890",
    });
    assert.deepEqual(result, { shipName: "Account Holder", shipPhone: "+911234567890" });
  });

  it("has nothing left to fall back to when every field is absent", () => {
    const result = resolveShipContact({});
    assert.deepEqual(result, { shipName: "", shipPhone: null });
  });
});
