# QR Guard — VS Code Source Package

QR Guard is an Expo SDK 54 React Native app for scanning UPI QR codes before payment. It parses the QR payload locally, validates the VPA structure and PSP handle, assigns a risk status, and requires the recipient identity to be visible before any UPI handoff.

## Features

- Live QR scanning with `expo-camera`
- UPI field parsing: `pa`, `pn`, `am`, `tn`, `mc`, and currency
- Risk statuses: **Valid**, **Unverified**, **Suspicious**, and **Blocked**
- Conservative PSP-handle recognition and anomaly signals
- Full VPA and payee-name safety gate
- UPI PIN warning: a UPI PIN is only for sending money, never receiving it
- QR image selection with `expo-image-picker`
- Browser image decoding through `BarcodeDetector` where supported
- Device-local recent scan history using AsyncStorage
- Suspicious and Blocked demo states
- Dark fintech UI with mobile-first scanner layout
- Vitest parser tests

## Requirements

- Node.js 20+ recommended
- pnpm 9+
- VS Code
- Expo CLI through the project dependencies
- For native camera testing: Expo Go or an Android/iOS development build

## Open in VS Code

1. Extract this ZIP.
2. Open the extracted folder in VS Code.
3. Open the integrated terminal in the project folder.
4. Install dependencies:

```bash
pnpm install
```

## Run the web preview

```bash
pnpm dev:metro
```

Then open the Expo web URL shown in the terminal. You can also use:

```bash
pnpm exec expo start --web
```

The live camera scanner needs a secure browser context and camera permission. The upload button works best in a modern Chrome or Edge browser with QR `BarcodeDetector` support.

## Online deployment

The web app is hosted on [Vercel](https://qr-guard-eta.vercel.app). Changes pushed to `main` trigger a new deployment.

## Run on a phone

```bash
pnpm exec expo start
```

Then scan the Expo QR code with Expo Go, or use:

```bash
pnpm android
pnpm ios
```

Native camera and image-picker permissions are configured in `app.config.ts`.

## Validate the code

```bash
pnpm check
pnpm test
```

The parser tests are in `tests/upi-parser.test.ts`. The main screen is `app/(tabs)/index.tsx`, and the UPI parsing/risk engine is `lib/upi.ts`.

## Important safety/product limitation

The current implementation performs local structural and heuristic checks. It does **not** connect to NPCI, a bank, or a UPI app API to prove that an account is genuine. A QR marked Valid should still be confirmed inside the chosen UPI app before payment.

## Main files

- `app/(tabs)/index.tsx` — scanner, result screen, upload, history, and demos
- `lib/upi.ts` — parser, validation, risk scoring, and sample payloads
- `tests/upi-parser.test.ts` — parser coverage
- `app.config.ts` — Expo permissions and native configuration
- `theme.config.js` — dark fintech theme tokens
- `package.json` — scripts and dependencies
- `pnpm-lock.yaml` — locked dependency versions
