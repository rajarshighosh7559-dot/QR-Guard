import { describe, expect, it } from "vitest";
import { blockedDemoUpiPayload, displayAmount, parseUpiQr, suspiciousDemoUpiPayload } from "../lib/upi";

describe("UPI QR parser", () => {
  it("parses structured fields and marks a recognized PSP handle as valid", () => {
    const result = parseUpiQr(
      "upi://pay?pa=harbor.coffee@icici&pn=Harbor%20Coffee&am=480&cu=INR&tn=Table%2042&mc=5812",
    );

    expect(result.isUpi).toBe(true);
    expect(result.fields).toMatchObject({
      pa: "harbor.coffee@icici",
      pn: "Harbor Coffee",
      am: "480",
      tn: "Table 42",
      mc: "5812",
    });
    expect(result.payeeAddress).toBe("harbor.coffee@icici");
    expect(result.payeeName).toBe("Harbor Coffee");
    expect(displayAmount(result)).toContain("480");
    expect(result.pspRecognized).toBe(true);
    expect(result.status).toBe("valid");
  });

  it("keeps a structurally valid individual VPA unverified when its handle is unknown", () => {
    const result = parseUpiQr("upi://pay?pa=alex.personal@newbank&pn=Alex%20Kumar&am=250&cu=INR");

    expect(result.status).toBe("unverified");
    expect(result.pspRecognized).toBe(false);
    expect(result.signals).toContain("The PSP handle @newbank is not in the current recognition list.");
  });

  it("blocks data that is not a UPI payment QR", () => {
    const result = parseUpiQr("https://example.com/cashback");

    expect(result.isUpi).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.headline).toContain("not a UPI payment QR");
  });

  it("flags missing recipient information and high pre-filled amounts", () => {
    const missingName = parseUpiQr("upi://pay?pa=shop@icici&am=100&cu=INR");
    const highAmount = parseUpiQr("upi://pay?pa=shop@icici&pn=Shop&am=150000&cu=INR");

    expect(missingName.status).toBe("suspicious");
    expect(missingName.signals).toContain("The QR is missing the payee name (pn).");
    expect(highAmount.status).toBe("suspicious");
    expect(highAmount.signals[0]).toContain("unusually high");
  });

  it("blocks unsupported currencies instead of treating them as safe", () => {
    const result = parseUpiQr("upi://pay?pa=shop@icici&pn=Shop&am=100&cu=USD");

    expect(result.status).toBe("blocked");
    expect(result.headline).toContain("invalid payment details");
    expect(result.signals).toContain("The QR uses USD, not INR.");
  });

  it("keeps the Suspicious demo focused on anomaly signals", () => {
    const result = parseUpiQr(suspiciousDemoUpiPayload);

    expect(result.status).toBe("suspicious");
    expect(result.signals).toContain("The QR is missing the payee name (pn).");
  });

  it("blocks the non-UPI demo payload", () => {
    const result = parseUpiQr(blockedDemoUpiPayload);

    expect(result.status).toBe("blocked");
    expect(result.isUpi).toBe(false);
  });
});
