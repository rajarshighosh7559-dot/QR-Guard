export type RiskStatus = "valid" | "unverified" | "suspicious" | "blocked";

export type UpiFields = {
  pa?: string;
  pn?: string;
  am?: string;
  tn?: string;
  mc?: string;
  cu?: string;
  tr?: string;
  tid?: string;
};

export type UpiPayload = {
  raw: string;
  isUpi: boolean;
  fields: UpiFields;
  payeeAddress?: string;
  payeeName?: string;
  amount?: string;
  note?: string;
  currency?: string;
  merchantCategory?: string;
  transactionReference?: string;
  pspHandle?: string;
  pspRecognized: boolean;
  status: RiskStatus;
  headline: string;
  explanation: string;
  signals: string[];
};

const VPA_PATTERN = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z0-9][a-z0-9.-]{1,63}$/i;
const DISPLAY_TEXT_PATTERN = /^[\p{L}\p{N} .,'&()/_-]+$/u;
const MAX_REASONABLE_PREFILLED_AMOUNT = 100000;

// PSP suffixes are maintained from the NPCI live-member ecosystem and a July 2026
// PayU handle reference. Recognition increases confidence; an unknown suffix is
// never blocked because new PSP handles and individual VPAs can appear over time.
export const KNOWN_PSP_HANDLES = new Set([
  "abfspay", "abcdicici", "airtel", "apl", "axl", "axb", "barodampay", "boi", "bpunity",
  "centralbank", "cnrb", "citrus", "dbs", "dlb", "equitas", "fam", "fifederal", "fincarebank",
  "finobank", "fkaxis", "freecharge", "freoicici", "gwaxis", "hsbc", "ibl", "icici", "ikwik",
  "indie", "indus", "inhdfc", "iob", "jarunity", "jio", "jupiteraxis", "jkb", "kbaxis", "kphdfc",
  "kotak", "kotak811", "mahb", "mboi", "mvhdfc", "naviaxis", "niyoicici", "okaxis", "okhdfcobank",
  "okicici", "oksbi", "oneyes", "pnb", "ptaxis", "ptyes", "ptsbi", "pthdfc", "payu", "pz", "rapl",
  "rmrbl", "sbi", "shriramhdfcbank", "sib", "sliceaxis", "slicepay", "slc", "superyes", "tapicici",
  "timecosmos", "trans", "upi", "waicici", "yapl", "ybl", "yes", "yescred", "yescurie", "yesfam",
  "yespay", "yespop", "yestp", "zoicici",
]);

function decode(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function parseFields(trimmed: string): UpiFields {
  const query = trimmed.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  return {
    pa: decode(params.get("pa")),
    pn: decode(params.get("pn")),
    am: decode(params.get("am")),
    tn: decode(params.get("tn")),
    mc: decode(params.get("mc")),
    cu: decode(params.get("cu")) || "INR",
    tr: decode(params.get("tr")),
    tid: decode(params.get("tid")),
  };
}

function formatAmount(amount?: string, currency?: string) {
  if (!amount) return "Amount set by recipient";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency ?? "INR"}`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function getPspHandle(vpa?: string) {
  const handle = vpa?.split("@")[1]?.toLowerCase();
  return handle;
}

export function parseUpiQr(raw: string): UpiPayload {
  const trimmed = raw.trim();

  if (!/^upi:\/\/pay\?/i.test(trimmed)) {
    return {
      raw: trimmed,
      isUpi: false,
      fields: {},
      pspRecognized: false,
      status: "blocked",
      headline: "Blocked: not a UPI payment QR",
      explanation: "This code does not use the standard UPI payment format. Do not open it as a payment without knowing what it contains.",
      signals: ["The scanned data is not a UPI payment payload."],
    };
  }

  const fields = parseFields(trimmed);
  const payeeAddress = fields.pa;
  const payeeName = fields.pn;
  const amount = fields.am;
  const currency = fields.cu || "INR";
  const pspHandle = getPspHandle(payeeAddress);
  const pspRecognized = Boolean(pspHandle && KNOWN_PSP_HANDLES.has(pspHandle));
  const signals: string[] = [];
  const vpaValid = Boolean(payeeAddress && VPA_PATTERN.test(payeeAddress));
  const nameValid = Boolean(payeeName && DISPLAY_TEXT_PATTERN.test(payeeName) && payeeName.trim().length >= 2);
  const numericAmount = amount ? Number(amount) : undefined;

  if (!payeeAddress) signals.push("The QR is missing the recipient VPA (pa).");
  else if (!vpaValid) signals.push("The recipient VPA does not match the expected structure.");
  else if (!pspRecognized) signals.push(`The PSP handle @${pspHandle} is not in the current recognition list.`);

  if (!payeeName) signals.push("The QR is missing the payee name (pn).");
  else if (!nameValid) signals.push("The payee name contains unusual characters or is too short.");

  if (amount && (!Number.isFinite(numericAmount) || Number(numericAmount) <= 0)) {
    signals.push("The pre-filled amount is invalid.");
  } else if (numericAmount !== undefined && numericAmount > MAX_REASONABLE_PREFILLED_AMOUNT) {
    signals.push(`The pre-filled amount is unusually high (over ₹${MAX_REASONABLE_PREFILLED_AMOUNT.toLocaleString("en-IN")}).`);
  }

  if (currency !== "INR") signals.push(`The QR uses ${currency}, not INR.`);
  if (fields.tn && !DISPLAY_TEXT_PATTERN.test(fields.tn)) signals.push("The transaction note contains unusual characters.");

  let status: RiskStatus = "valid";
  let headline = "Valid UPI QR";
  let explanation = pspRecognized
    ? "The QR has a valid VPA structure and a recognized PSP handle. Confirm the full recipient details in your UPI app before paying."
    : "The QR has a valid VPA structure, but its PSP handle is not in our current recognition list. Treat this recipient as unverified.";

  if (!vpaValid || (amount && (!Number.isFinite(numericAmount) || Number(numericAmount) <= 0)) || currency !== "INR") {
    status = "blocked";
    headline = "Blocked: invalid payment details";
    explanation = "The payment payload contains details that QR Guard cannot safely validate. Do not continue with this QR.";
  } else if (!payeeName || !nameValid || (numericAmount !== undefined && numericAmount > MAX_REASONABLE_PREFILLED_AMOUNT) || (fields.tn && !DISPLAY_TEXT_PATTERN.test(fields.tn))) {
    status = "suspicious";
    headline = "Suspicious payment details";
    explanation = "The QR contains anomaly signals that need your attention. Verify the recipient and amount through another trusted channel before paying.";
  } else if (!pspRecognized) {
    status = "unverified";
    headline = "Unverified recipient";
    explanation = "The QR is structurally valid, but QR Guard does not recognize this PSP handle yet. A valid QR is not proof that the recipient is trustworthy.";
  }

  return {
    raw: trimmed,
    isUpi: true,
    fields,
    payeeAddress,
    payeeName,
    amount,
    note: fields.tn,
    currency,
    merchantCategory: fields.mc,
    transactionReference: fields.tr || fields.tid,
    pspHandle,
    pspRecognized,
    status,
    headline,
    explanation,
    signals,
  };
}

export function displayAmount(payload: UpiPayload) {
  return formatAmount(payload.amount, payload.currency);
}

export const demoUpiPayload = "upi://pay?pa=harbor.coffee@icici&pn=Harbor%20Coffee&am=480&cu=INR&tn=Table%2042&mc=5812";

export const suspiciousDemoUpiPayload =
  "upi://pay?pa=urgent.collect@unknownpsp&pn=&am=250000&cu=INR&tn=URGENT%20PAY%20NOW";

export const blockedDemoUpiPayload =
  "https://example.invalid/payment/claim-prize";
