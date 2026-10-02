# QR Guard

**Scan before you pay.** QR Guard helps you inspect UPI payment QR codes before handing them off to a UPI app.

**Try it online:** [qr-guard-eta.vercel.app](https://qr-guard-eta.vercel.app)

**Source code:** [GitHub repository](https://github.com/rajarshighosh7559-dot/QR-Guard)

## Features

- **Live QR scanning** with camera permission on supported devices and browsers.
- **QR image upload** to decode a saved QR image where the browser supports `BarcodeDetector`.
- **Local UPI parsing** for the payee VPA (`pa`), payee name (`pn`), amount (`am`), note (`tn`), merchant category (`mc`), currency (`cu`), and transaction reference.
- **Risk review** with Valid, Unverified, Suspicious, and Blocked results, including VPA structure checks, recognized PSP-handle lookup, and anomaly signals.
- **Recipient confirmation gate**: the app requires both the full VPA and payee name before offering a UPI-app handoff.
- **Recent scan history** stored locally on the device.
- **Sample scenarios** for a normal, suspicious, and blocked QR so you can explore the review flow without a real payment.
- **Payment safety guidance**, including a reminder that a UPI PIN is used to send money, never to receive it.
- **Installable web app** with a branded home-screen icon and offline app-shell caching.

## How the checks work

QR Guard parses the QR payload on the device and applies structural and heuristic checks. A recognized PSP handle is not proof that an account is genuine, and a Valid result is not a guarantee that a payment is safe. QR Guard does not connect to NPCI, a bank, or a UPI app to verify account ownership. Always confirm the payee and amount in your UPI app before paying.

QR Guard does not collect a UPI PIN or initiate a payment itself. The UPI handoff happens only after you choose to continue.

## Run locally

Requirements: Node.js 20.19.4 or later and pnpm 9.

```bash
pnpm install
pnpm exec expo start --web
```

Open the local URL printed by Expo. On a phone, run `pnpm exec expo start` and scan the Expo QR code with Expo Go. Camera access requires permission; web camera access generally requires HTTPS or localhost. Image upload decoding depends on browser `BarcodeDetector` support.

## Install on a device

Open the Vercel site over HTTPS in a supported browser. In Chrome or Edge, choose **Install QR Guard** from the address-bar install icon or browser menu. On iPhone or iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**. The installed app caches its app shell after the first visit; scanning still depends on browser camera and QR-decoding support.

## Checks

```bash
pnpm check
pnpm test
```

## Hosting

The web app is deployed on Vercel and redeploys from `main` when changes are pushed to GitHub. See [README-VSCODE.md](./README-VSCODE.md) for additional source-package notes.

## Built with

Expo, React Native, Expo Router, TypeScript, NativeWind, and Vitest.
