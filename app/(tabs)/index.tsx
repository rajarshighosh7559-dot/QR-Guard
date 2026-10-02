import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  demoUpiPayload,
  blockedDemoUpiPayload,
  displayAmount,
  parseUpiQr,
  suspiciousDemoUpiPayload,
  type RiskStatus,
  type UpiPayload,
} from "@/lib/upi";

const palette = {
  ink: "#070B14",
  inkSoft: "#AAB5CC",
  paper: "#070B14",
  card: "#111827",
  line: "#26334A",
  muted: "#7F8BA3",
  blue: "#5B7CFF",
  blueSoft: "#1A2450",
  green: "#35D58A",
  greenSoft: "#123A31",
  amber: "#FFC857",
  amberSoft: "#3A2C15",
  red: "#FF5C72",
  redSoft: "#421B2A",
};

const riskMeta: Record<RiskStatus, { label: string; color: string; background: string; icon: string }> = {
  valid: { label: "Valid", color: palette.green, background: palette.greenSoft, icon: "✓" },
  unverified: { label: "Unverified", color: palette.amber, background: palette.amberSoft, icon: "!" },
  suspicious: { label: "Suspicious", color: palette.red, background: palette.redSoft, icon: "!" },
  blocked: { label: "Blocked", color: palette.red, background: palette.redSoft, icon: "×" },
};

const HISTORY_KEY = "qr-guard.recent-scans.v1";

type RecentScan = {
  id: string;
  status: RiskStatus;
  payeeName: string;
  payeeAddress: string;
  amount: string;
  headline: string;
  scannedAt: string;
};

function triggerLightHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

function triggerResultHaptic(status: RiskStatus) {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(
      status === "blocked" || status === "suspicious"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    );
  }
}

function RiskBadge({ status }: { status: RiskStatus }) {
  const meta = riskMeta[status];
  return (
    <View style={[styles.riskBadge, { backgroundColor: meta.background }]}>
      <View style={[styles.riskIcon, { backgroundColor: meta.color }]}>
        <Text style={styles.riskIconText}>{meta.icon}</Text>
      </View>
      <Text style={[styles.riskBadgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.monoValue]}>
        {value}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<UpiPayload | null>(null);
  const [reported, setReported] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenY = useRef(new Animated.Value(0)).current;
  const canProceed = Boolean(result?.isUpi && result.payeeAddress && result.payeeName);

  useEffect(() => {
    screenOpacity.setValue(0);
    screenY.setValue(10);
    Animated.parallel([
      Animated.timing(screenOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(screenY, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [isScanning, result, screenOpacity, screenY]);

  useEffect(() => {
    void AsyncStorage.getItem(HISTORY_KEY).then((value) => {
      if (!value) return;
      try {
        setRecentScans(JSON.parse(value) as RecentScan[]);
      } catch {
        setRecentScans([]);
      }
    });
  }, []);

  async function rememberResult(parsed: UpiPayload) {
    const next: RecentScan[] = [
      {
        id: `${Date.now()}-${parsed.status}`,
        status: parsed.status,
        payeeName: parsed.payeeName || "Name not provided",
        payeeAddress: parsed.payeeAddress || "Not found",
        amount: displayAmount(parsed),
        headline: parsed.headline,
        scannedAt: new Date().toISOString(),
      },
      ...recentScans,
    ].slice(0, 5);
    setRecentScans(next);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function showParsedResult(parsed: UpiPayload) {
    setIsScanning(false);
    setResult(parsed);
    setReported(false);
    triggerResultHaptic(parsed.status);
    void rememberResult(parsed);
  }

  async function startScanner() {
    triggerLightHaptic();
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert(
          "Camera permission needed",
          "QR Guard uses your camera only to read the QR code. It never reads your UPI PIN or bank credentials.",
        );
        return;
      }
    }
    setResult(null);
    setReported(false);
    setIsScanning(true);
  }

  function handleBarcodeScanned({ data }: BarcodeScanningResult) {
    if (!isScanning) return;
    showParsedResult(parseUpiQr(data));
  }

  function showDemoPayload(payload: string) {
    triggerLightHaptic();
    showParsedResult(parseUpiQr(payload));
  }

  function showDemo() {
    showDemoPayload(demoUpiPayload);
  }

  async function uploadQrImage() {
    triggerLightHaptic();
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (selection.canceled) return;
    const uri = selection.assets[0]?.uri;
    if (!uri) return;
    setUploadedImageUri(uri);
    if (Platform.OS !== "web") {
      Alert.alert("Image selected", "This device selected the QR image. Use the camera scanner to decode it, or try the image again in a modern browser.");
      return;
    }
    const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: new (options?: { formats: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!Detector || typeof createImageBitmap !== "function") {
      Alert.alert("Image decoder unavailable", "Your browser cannot decode QR images yet. Try Open scanner or use a modern Chrome or Edge browser.");
      return;
    }
    try {
      const response = await fetch(uri);
      const bitmap = await createImageBitmap(await response.blob());
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      bitmap.close();
      const rawValue = codes[0]?.rawValue;
      if (!rawValue) {
        Alert.alert("No QR code found", "Choose a clear image where the QR code is fully visible.");
        return;
      }
      showParsedResult(parseUpiQr(rawValue));
    } catch {
      Alert.alert("Could not read image", "Choose a clearer QR image or use the live scanner instead.");
    }
  }

  function resetReview() {
    triggerLightHaptic();
    setResult(null);
    setReported(false);
  }

  async function openInUpiApp() {
    if (!result?.isUpi || !result.payeeAddress || !result.payeeName) {
      Alert.alert(
        "Recipient details required",
        "QR Guard will not open a UPI app until the full recipient VPA and payee name are visible. Confirm the recipient through another trusted channel.",
      );
      return;
    }
    triggerLightHaptic();
    try {
      const supported = await Linking.canOpenURL(result.raw);
      if (!supported && Platform.OS === "web") {
        Alert.alert(
          "Ready for handoff",
          "On your phone, this QR would now open the UPI app you choose. The payment itself stays inside that app.",
        );
        return;
      }
      if (!supported) {
        Alert.alert("No UPI app found", "Install a supported UPI app, then try again.");
        return;
      }
      await Linking.openURL(result.raw);
    } catch {
      Alert.alert("Could not open UPI app", "Review the recipient and amount, then open your preferred UPI app manually.");
    }
  }

  if (isScanning) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-ink" className="p-0">
        <Animated.View style={[styles.scannerScreen, { opacity: screenOpacity, transform: [{ translateY: screenY }] }]}> 
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTopBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
                onPress={() => setIsScanning(false)}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
              <View style={styles.scannerTopCopy}>
                <Text style={styles.scannerEyebrow}>QR GUARD</Text>
                <Text style={styles.scannerTitle}>Scan before you pay</Text>
              </View>
              <View style={styles.topBarSpacer} />
            </View>
            <View style={styles.scanWindow}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.scannerBottomCopy}>
              <View style={styles.scanHintPill}>
                <View style={styles.liveDot} />
                <Text style={styles.scanHintText}>Point at a UPI QR code</Text>
              </View>
              <Text style={styles.scanHintSecondary}>We decode it locally before showing the payment app.</Text>
            </View>
          </View>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <Animated.ScrollView style={{ opacity: screenOpacity, transform: [{ translateY: screenY }] }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.brandMark}>
            <View style={styles.brandMarkInner} />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>QR GUARD</Text>
            <Text style={styles.brandCaption}>scan before you pay</Text>
          </View>
          <View style={styles.privacyPill}>
            <View style={styles.privacyDot} />
            <Text style={styles.privacyText}>PRIVATE BY DEFAULT</Text>
          </View>
        </View>

        <View style={styles.heroSection}>
          <Text style={styles.heroKicker}>YOUR PAYMENT, YOUR CHECK</Text>
          <Text style={styles.heroTitle}>Know who gets paid.</Text>
          <Text style={styles.heroBody}>
            Read the recipient, amount, and risk signals before your UPI app opens.
          </Text>
        </View>

        {!result ? (
          <View style={styles.scanCard}>
            <View style={styles.scanCardTop}>
              <View>
                <Text style={styles.cardEyebrow}>READY WHEN YOU ARE</Text>
                <Text style={styles.scanCardTitle}>Scan a QR code</Text>
              </View>
              <View style={styles.shieldIcon}>
                <Text style={styles.shieldIconText}>⌁</Text>
              </View>
            </View>
            <Text style={styles.scanCardBody}>
              We check the payment payload on this device first. No UPI PIN. No bank login. No payment until you choose to continue.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open QR scanner"
              onPress={startScanner}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            >
              <Text style={styles.primaryButtonText}>Open scanner</Text>
              <Text style={styles.primaryButtonArrow}>→</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View a demo QR review"
              onPress={showDemo}
              style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}
            >
              <Text style={styles.demoButtonText}>See a sample review</Text>
              <Text style={styles.demoButtonArrow}>↗</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload a QR image"
              onPress={uploadQrImage}
              style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
            >
              <Text style={styles.uploadButtonIcon}>▧</Text>
              <Text style={styles.uploadButtonText}>{uploadedImageUri ? "Choose another QR image" : "Upload a QR image"}</Text>
            </Pressable>
            {uploadedImageUri ? <Image source={{ uri: uploadedImageUri }} style={styles.uploadPreview} /> : null}
            <View style={styles.sampleRow}>
              <Pressable onPress={() => showDemoPayload(suspiciousDemoUpiPayload)} style={({ pressed }) => [styles.sampleChip, pressed && styles.pressed]}>
                <View style={[styles.sampleDot, { backgroundColor: palette.red }]} />
                <Text style={styles.sampleChipText}>Suspicious demo</Text>
              </Pressable>
              <Pressable onPress={() => showDemoPayload(blockedDemoUpiPayload)} style={({ pressed }) => [styles.sampleChip, pressed && styles.pressed]}>
                <View style={[styles.sampleDot, { backgroundColor: palette.red }]} />
                <Text style={styles.sampleChipText}>Blocked demo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.resultCard}>
            <View style={[styles.statusHero, { backgroundColor: riskMeta[result.status].background }]}> 
              <View style={[styles.statusHeroIcon, { backgroundColor: riskMeta[result.status].color }]}> 
                <Text style={styles.statusHeroIconText}>{riskMeta[result.status].icon}</Text>
              </View>
              <View style={styles.statusHeroCopy}>
                <Text style={[styles.statusHeroLabel, { color: riskMeta[result.status].color }]}>QR SAFETY STATUS</Text>
                <Text style={[styles.statusHeroTitle, { color: riskMeta[result.status].color }]}>{riskMeta[result.status].label}</Text>
              </View>
              <Text style={[styles.statusHeroArrow, { color: riskMeta[result.status].color }]}>↗</Text>
            </View>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.cardEyebrow}>SCAN COMPLETE</Text>
                <Text style={styles.resultTitle}>{result.headline}</Text>
              </View>
              <RiskBadge status={result.status} />
            </View>

            <View style={styles.recipientBlock}>
              <Text style={styles.recipientLabel}>RECIPIENT</Text>
              <Text style={styles.recipientName}>{result.payeeName || "Name not provided"}</Text>
              <Text style={styles.recipientAmount}>{displayAmount(result)}</Text>
            </View>

            <View style={styles.detailList}>
              <DetailRow label="UPI ID" value={result.payeeAddress || "Not found"} mono />
              {result.note ? <DetailRow label="NOTE" value={result.note} /> : null}
              {result.merchantCategory ? <DetailRow label="CATEGORY" value={result.merchantCategory} /> : null}
            </View>

            <View style={styles.explanationBox}>
              <View style={[styles.explanationMark, { backgroundColor: riskMeta[result.status].color }]}>
                <Text style={styles.explanationMarkText}>{riskMeta[result.status].icon}</Text>
              </View>
              <Text style={styles.explanationText}>{result.explanation}</Text>
            </View>

            {result.signals.length > 0 ? (
              <View style={styles.signalList}>
                {result.signals.map((signal) => (
                  <View style={styles.signalRow} key={signal}>
                    <View style={styles.signalBullet} />
                    <Text style={styles.signalText}>{signal}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.handoffWarning}>
              <Text style={styles.handoffWarningTitle}>Before you continue</Text>
              <Text style={styles.handoffWarningText}>
                Only enter your UPI PIN to send money. A UPI PIN is never required to receive money. QR Guard will not open your UPI app until the full VPA and payee name are shown above.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to UPI app"
              onPress={openInUpiApp}
              disabled={!canProceed}
              style={({ pressed }) => [styles.primaryButton, !canProceed && styles.disabledButton, pressed && canProceed && styles.primaryButtonPressed]}
            >
              <Text style={[styles.primaryButtonText, !canProceed && styles.disabledButtonText]}>
                {canProceed ? "Continue to UPI app" : "Recipient details required"}
              </Text>
              <Text style={[styles.primaryButtonArrow, !canProceed && styles.disabledButtonText]}>→</Text>
            </Pressable>
            <View style={styles.resultActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Report this QR code"
                onPress={() => {
                  triggerLightHaptic();
                  setReported(true);
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>{reported ? "Report received" : "Report QR"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan another QR code"
                onPress={resetReview}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>Scan another</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!result && recentScans.length > 0 ? (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyEyebrow}>ON THIS DEVICE</Text>
                <Text style={styles.historyTitle}>Recent scans</Text>
              </View>
              <Text style={styles.historyCount}>{recentScans.length}/5</Text>
            </View>
            {recentScans.map((scan) => (
              <View style={styles.historyRow} key={scan.id}>
                <View style={[styles.historyStatus, { backgroundColor: riskMeta[scan.status].background }]}>
                  <Text style={[styles.historyStatusText, { color: riskMeta[scan.status].color }]}>{riskMeta[scan.status].icon}</Text>
                </View>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyHeadline} numberOfLines={1}>{scan.payeeName}</Text>
                  <Text style={styles.historySubline} numberOfLines={1}>{scan.payeeAddress} · {scan.amount}</Text>
                </View>
                <Text style={[styles.historyRisk, { color: riskMeta[scan.status].color }]}>{riskMeta[scan.status].label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.promiseRow}>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseNumber}>01</Text>
            <Text style={styles.promiseText}>Decode locally</Text>
          </View>
          <View style={styles.promiseDivider} />
          <View style={styles.promiseItem}>
            <Text style={styles.promiseNumber}>02</Text>
            <Text style={styles.promiseText}>Explain risk</Text>
          </View>
          <View style={styles.promiseDivider} />
          <View style={styles.promiseItem}>
            <Text style={styles.promiseNumber}>03</Text>
            <Text style={styles.promiseText}>You decide</Text>
          </View>
        </View>

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>A valid QR is not automatically a safe QR.</Text>
          <Text style={styles.disclaimerText}>
            QR Guard is an early safety layer. Always confirm the payee name and amount inside your UPI app. Never enter your UPI PIN to receive money.
          </Text>
        </View>
      </Animated.ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.card,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkInner: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: palette.blue,
    transform: [{ rotate: "45deg" }],
  },
  brandCopy: {
    flex: 1,
  },
  brandName: {
    color: "#F4F7FF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  brandCaption: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 1,
  },
  privacyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: palette.line,
  },
  privacyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.green,
  },
  privacyText: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  heroSection: {
    paddingTop: 42,
    paddingBottom: 20,
  },
  heroKicker: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 9,
  },
  heroTitle: {
    color: "#F4F7FF",
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1.4,
  },
  heroBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 13,
    maxWidth: 335,
  },
  scanCard: {
    backgroundColor: palette.ink,
    borderRadius: 26,
    padding: 20,
    shadowColor: palette.ink,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  scanCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardEyebrow: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  scanCardTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "700",
  },
  shieldIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#1D315D",
    alignItems: "center",
    justifyContent: "center",
  },
  shieldIconText: {
    color: "#AFC2FF",
    fontSize: 28,
    lineHeight: 28,
    transform: [{ rotate: "180deg" }],
  },
  scanCardBody: {
    color: "#B8C4DA",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 15,
    marginBottom: 20,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: palette.blue,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    backgroundColor: "#D9DFEA",
  },
  disabledButtonText: {
    color: "#7A8496",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButtonArrow: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 25,
  },
  demoButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 18,
    padding: 4,
  },
  demoButtonText: {
    color: "#C5D2EA",
    fontSize: 13,
    fontWeight: "600",
  },
  demoButtonArrow: {
    color: "#C5D2EA",
    fontSize: 16,
  },
  uploadButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    paddingVertical: 6,
  },
  uploadButtonIcon: {
    color: palette.blue,
    fontSize: 16,
    fontWeight: "800",
  },
  uploadButtonText: {
    color: "#AFC1E6",
    fontSize: 12,
    fontWeight: "700",
  },
  uploadPreview: {
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 12,
    marginTop: 5,
    borderWidth: 1,
    borderColor: palette.line,
  },
  sampleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  sampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "#172136",
  },
  sampleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sampleChipText: {
    color: "#C5D2EA",
    fontSize: 10,
    fontWeight: "700",
  },
  resultCard: {
    backgroundColor: palette.card,
    borderRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statusHero: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },
  statusHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusHeroIconText: {
    color: "#070B14",
    fontSize: 22,
    fontWeight: "900",
  },
  statusHeroCopy: {
    flex: 1,
    marginLeft: 12,
  },
  statusHeroLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  statusHeroTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  statusHeroArrow: {
    fontSize: 24,
    fontWeight: "800",
  },
  historySection: {
    marginTop: 22,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  historyEyebrow: {
    color: palette.blue,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  historyTitle: {
    color: "#F4F7FF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 3,
  },
  historyCount: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    padding: 11,
    marginBottom: 7,
  },
  historyStatus: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyStatusText: {
    fontSize: 15,
    fontWeight: "900",
  },
  historyCopy: {
    flex: 1,
  },
  historyHeadline: {
    color: "#F4F7FF",
    fontSize: 12,
    fontWeight: "800",
  },
  historySubline: {
    color: palette.muted,
    fontSize: 10,
    marginTop: 3,
  },
  historyRisk: {
    fontSize: 10,
    fontWeight: "800",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  resultTitle: {
    color: "#F4F7FF",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    maxWidth: 190,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  riskIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  riskIconText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  recipientBlock: {
    backgroundColor: "#172136",
    borderRadius: 17,
    padding: 15,
    marginTop: 20,
  },
  recipientLabel: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  recipientName: {
    color: "#F4F7FF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  recipientAmount: {
    color: palette.blue,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  detailList: {
    marginTop: 14,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  detailLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    paddingTop: 2,
  },
  detailValue: {
    color: "#DDE5F6",
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  monoValue: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },
  explanationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#172136",
    borderRadius: 14,
    padding: 12,
    marginTop: 15,
  },
  explanationMark: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  explanationMarkText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  explanationText: {
    color: palette.inkSoft,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  handoffWarning: {
    backgroundColor: "#302714",
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#6D5521",
  },
  handoffWarningTitle: {
    color: palette.amber,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  handoffWarningText: {
    color: "#F2D58A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  signalList: {
    paddingTop: 12,
    gap: 7,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  signalBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.amber,
    marginTop: 6,
  },
  signalText: {
    color: palette.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  resultActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172136",
    borderWidth: 1,
    borderColor: palette.line,
  },
  secondaryButtonText: {
    color: "#E8EEFF",
    fontSize: 12,
    fontWeight: "700",
  },
  promiseRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 25,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line,
  },
  promiseItem: {
    flex: 1,
    gap: 5,
  },
  promiseNumber: {
    color: palette.blue,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  promiseText: {
    color: palette.inkSoft,
    fontSize: 11,
    fontWeight: "700",
  },
  promiseDivider: {
    width: 1,
    height: 28,
    backgroundColor: palette.line,
    marginHorizontal: 7,
  },
  disclaimerBox: {
    paddingTop: 20,
  },
  disclaimerTitle: {
    color: palette.inkSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  disclaimerText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.68,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: palette.ink,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 8, 18, 0.52)",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
    justifyContent: "space-between",
  },
  scannerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 18, 32, 0.72)",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 28,
  },
  scannerTopCopy: {
    alignItems: "center",
  },
  scannerEyebrow: {
    color: "#B8C8FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  scannerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  topBarSpacer: {
    width: 42,
  },
  scanWindow: {
    alignSelf: "center",
    width: "88%",
    maxWidth: 380,
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(7, 11, 20, 0.18)",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 38,
    height: 38,
    borderColor: "#FFFFFF",
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 15,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 15,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 15,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 15,
  },
  scannerBottomCopy: {
    alignItems: "center",
  },
  scanHintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: "rgba(11, 18, 32, 0.8)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#73E5B2",
  },
  scanHintText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scanHintSecondary: {
    color: "#D4DBED",
    fontSize: 12,
    marginTop: 10,
  },
});
