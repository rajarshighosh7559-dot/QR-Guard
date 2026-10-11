import type { UpiPayload } from "@/lib/upi";

export type RiskGuidance = {
  label: "Safe" | "Review" | "Caution";
  title: string;
  detail: string;
};

export function getRiskGuidance(result: UpiPayload): RiskGuidance[] {
  if (!result.isUpi) {
    return [
      {
        label: "Caution",
        title: "This QR is not a UPI intent.",
        detail:
          "Don't open it as a payment. Only continue with a UPI payment QR you recognize.",
      },
    ];
  }

  const guidance: RiskGuidance[] = [];
  const highAmountSignal = result.signals.find((signal) =>
    signal.includes("amount is unusually high"),
  );
  if (highAmountSignal) {
    guidance.push({
      label: "Review",
      title: "Amount is unusually high.",
      detail: `${highAmountSignal} Confirm the amount with the recipient before opening your UPI app.`,
    });
  }

  if (!result.pspRecognized && result.payeeAddress) {
    guidance.push({
      label: "Review",
      title: "UPI intent format is not fully recognized.",
      detail:
        "The payment provider is not in QR Guard's current recognition list. Verify the recipient and amount before continuing.",
    });
  }

  if (!result.payeeAddress || !result.payeeName) {
    guidance.push({
      label: "Caution",
      title: "Recipient details are incomplete.",
      detail:
        "Confirm the payee's name and UPI ID through another trusted channel before continuing.",
    });
  }

  if (guidance.length > 0) return guidance;

  if (result.status === "valid") {
    return [
      {
        label: "Safe",
        title: "Known payment format.",
        detail:
          "The UPI intent matches an expected payment format. This does not verify account ownership or guarantee a safe payment.",
      },
    ];
  }

  if (result.status === "suspicious") {
    return [
      {
        label: "Review",
        title: "Review recipient and payment details.",
        detail: result.explanation,
      },
    ];
  }

  return [
    {
      label: "Caution",
      title: "Payment details need attention.",
      detail: result.explanation,
    },
  ];
}
