import { describe, expect, it } from "vitest";

import {
  blockedDemoUpiPayload,
  demoUpiPayload,
  parseUpiQr,
  suspiciousDemoUpiPayload,
} from "../lib/upi";
import { getRiskGuidance } from "../lib/risk-guidance";

describe("UPI risk guidance", () => {
  it("describes a recognized intent as a known format without guaranteeing safety", () => {
    const guidance = getRiskGuidance(parseUpiQr(demoUpiPayload));

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      label: "Safe",
      title: "Known payment format.",
    });
    expect(guidance[0].detail).toContain("does not verify account ownership");
  });

  it("shows separate review and caution cards when an intent has multiple issues", () => {
    const guidance = getRiskGuidance(parseUpiQr(suspiciousDemoUpiPayload));

    expect(guidance.map(({ label, title }) => [label, title])).toEqual([
      ["Review", "Amount is unusually high."],
      ["Review", "UPI intent format is not fully recognized."],
      ["Caution", "Recipient details are incomplete."],
    ]);
  });

  it("flags an unusually high pre-filled amount", () => {
    const result = parseUpiQr(
      "upi://pay?pa=merchant@icici&pn=Merchant&am=150000&cu=INR",
    );
    const guidance = getRiskGuidance(result);

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      label: "Review",
      title: "Amount is unusually high.",
    });
  });

  it("cautions when recipient details are incomplete", () => {
    const result = parseUpiQr("upi://pay?pa=merchant@icici&pn=");
    const guidance = getRiskGuidance(result);

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      label: "Caution",
      title: "Recipient details are incomplete.",
    });
  });

  it("cautions when a scanned QR is not a UPI intent", () => {
    const guidance = getRiskGuidance(parseUpiQr(blockedDemoUpiPayload));

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      label: "Caution",
      title: "This QR is not a UPI intent.",
    });
  });

  it("asks users to review intents from unrecognized payment providers", () => {
    const result = parseUpiQr(
      "upi://pay?pa=alex.personal@newbank&pn=Alex%20Kumar&am=250&cu=INR",
    );
    const guidance = getRiskGuidance(result);

    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({
      label: "Review",
      title: "UPI intent format is not fully recognized.",
    });
  });
});
