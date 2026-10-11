import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getAppPalette } from "@/constants/app-palette";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader } from "@/components/page-header";
import { RiskStatusCard } from "@/components/risk-status-card";
import { useThemeContext } from "@/lib/theme-provider";
import {
  demoUpiPayload,
  blockedDemoUpiPayload,
  displayAmount,
  parseUpiQr,
  suspiciousDemoUpiPayload,
  type RiskStatus,
  type UpiPayload,
} from "@/lib/upi";

type Palette = ReturnType<typeof getAppPalette>;
type RiskMeta = Record<
  RiskStatus,
  { label: string; color: string; background: string; icon: string }
>;

function getRiskMeta(palette: Palette): RiskMeta {
  return {
    valid: {
      label: "Valid",
      color: palette.green,
      background: palette.greenSoft,
      icon: "✓",
    },
    unverified: {
      label: "Unverified",
      color: palette.amber,
      background: palette.amberSoft,
      icon: "!",
    },
    suspicious: {
      label: "Suspicious",
      color: palette.red,
      background: palette.redSoft,
      icon: "!",
    },
    blocked: {
      label: "Blocked",
      color: palette.red,
      background: palette.redSoft,
      icon: "×",
    },
  };
}

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

type TabRoutes = {
  index: undefined;
  scan: undefined;
  history: undefined;
  learn: undefined;
};

const DEMO_SCAN_SIGNATURES = new Set(
  [demoUpiPayload, suspiciousDemoUpiPayload, blockedDemoUpiPayload].map(
    (payload) => {
      const parsed = parseUpiQr(payload);
      return JSON.stringify([
        parsed.status,
        parsed.payeeName || "Name not provided",
        parsed.payeeAddress || "Not found",
        displayAmount(parsed),
        parsed.headline,
      ]);
    },
  ),
);

function isDemoScan(scan: RecentScan) {
  return DEMO_SCAN_SIGNATURES.has(
    JSON.stringify([
      scan.status,
      scan.payeeName,
      scan.payeeAddress,
      scan.amount,
      scan.headline,
    ]),
  );
}

function isRecentScan(value: unknown): value is RecentScan {
  if (!value || typeof value !== "object") return false;
  const scan = value as Record<string, unknown>;
  return (
    typeof scan.id === "string" &&
    (scan.status === "valid" ||
      scan.status === "unverified" ||
      scan.status === "suspicious" ||
      scan.status === "blocked") &&
    typeof scan.payeeName === "string" &&
    typeof scan.payeeAddress === "string" &&
    typeof scan.amount === "string" &&
    typeof scan.headline === "string" &&
    typeof scan.scannedAt === "string"
  );
}

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

function RiskBadge({
  status,
  styles,
  riskMeta,
}: {
  status: RiskStatus;
  styles: HomeStyles;
  riskMeta: RiskMeta;
}) {
  const meta = riskMeta[status];
  return (
    <View style={[styles.riskBadge, { backgroundColor: meta.background }]}>
      <View style={[styles.riskIcon, { backgroundColor: meta.color }]}>
        <Text style={styles.riskIconText}>{meta.icon}</Text>
      </View>
      <Text style={[styles.riskBadgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  styles,
}: {
  label: string;
  value: string;
  mono?: boolean;
  styles: HomeStyles;
}) {
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
  const { colorScheme } = useThemeContext();
  const palette = useMemo(() => getAppPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const riskMeta = useMemo(() => getRiskMeta(palette), [palette]);
  const navigation = useNavigation<BottomTabNavigationProp<TabRoutes>>();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<UpiPayload | null>(null);
  const [reported, setReported] = useState(false);
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenY = useRef(new Animated.Value(0)).current;
  const radarProgress = useRef(new Animated.Value(0)).current;
  const canProceed = Boolean(
    result?.isUpi && result.payeeAddress && result.payeeName,
  );

  useEffect(
    () =>
      navigation.addListener("tabPress", () => {
        setIsScanning(false);
        setResult(null);
        setReported(false);
      }),
    [navigation],
  );

  useEffect(() => {
    screenOpacity.setValue(0);
    screenY.setValue(10);
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(screenY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isScanning, result, screenOpacity, screenY]);

  useEffect(() => {
    const radarAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(radarProgress, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(radarProgress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    radarAnimation.start();
    return () => radarAnimation.stop();
  }, [radarProgress]);

  async function rememberResult(parsed: UpiPayload) {
    const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);
    let recentScans: RecentScan[] = [];
    if (storedHistory) {
      try {
        const savedScans: unknown = JSON.parse(storedHistory);
        if (Array.isArray(savedScans)) {
          recentScans = savedScans
            .filter(isRecentScan)
            .filter((scan) => !isDemoScan(scan));
        }
      } catch (error) {
        console.error(
          "Could not read recent QR scan history before saving.",
          error,
        );
      }
    }
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
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function showParsedResult(parsed: UpiPayload, remember = true) {
    setIsScanning(false);
    setResult(parsed);
    setReported(false);
    triggerResultHaptic(parsed.status);
    if (remember) {
      void rememberResult(parsed).catch((error) => {
        console.error("Could not save the recent QR scan.", error);
      });
    }
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
      Alert.alert(
        "Image selected",
        "This device selected the QR image. Use the camera scanner to decode it, or try the image again in a modern browser.",
      );
      return;
    }
    const Detector = (
      globalThis as typeof globalThis & {
        BarcodeDetector?: new (options?: { formats: string[] }) => {
          detect: (source: ImageBitmap) => Promise<{ rawValue?: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || typeof createImageBitmap !== "function") {
      Alert.alert(
        "Image decoder unavailable",
        "Your browser cannot decode QR images yet. Try Open scanner or use a modern Chrome or Edge browser.",
      );
      return;
    }
    try {
      const response = await fetch(uri);
      const bitmap = await createImageBitmap(await response.blob());
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      bitmap.close();
      const rawValue = codes[0]?.rawValue;
      if (!rawValue) {
        Alert.alert(
          "No QR code found",
          "Choose a clear image where the QR code is fully visible.",
        );
        return;
      }
      showParsedResult(parseUpiQr(rawValue));
    } catch {
      Alert.alert(
        "Could not read image",
        "Choose a clearer QR image or use the live scanner instead.",
      );
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
        Alert.alert(
          "No UPI app found",
          "Install a supported UPI app, then try again.",
        );
        return;
      }
      await Linking.openURL(result.raw);
    } catch {
      Alert.alert(
        "Could not open UPI app",
        "Review the recipient and amount, then open your preferred UPI app manually.",
      );
    }
  }

  if (isScanning) {
    return (
      <ScreenContainer
        edges={["top", "bottom", "left", "right"]}
        containerClassName="bg-background"
        className="p-0"
      >
        <Animated.View
          style={[
            styles.scannerScreen,
            { opacity: screenOpacity, transform: [{ translateY: screenY }] },
          ]}
        >
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
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
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
              <Text style={styles.scanHintSecondary}>
                We decode it locally before showing the payment app.
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <Animated.ScrollView
        style={{ opacity: screenOpacity, transform: [{ translateY: screenY }] }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />

        {!result ? (
          <View style={styles.homeScanContent}>
            <Text style={styles.homeEyebrow}>UPI INTENT SCANNER</Text>
            <View
              style={[
                styles.homeScanFrame,
                { borderColor: palette.line, backgroundColor: palette.card },
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={[
                  styles.homeScanCorner,
                  styles.homeScanCornerTopLeft,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.homeScanCorner,
                  styles.homeScanCornerTopRight,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.homeScanCorner,
                  styles.homeScanCornerBottomLeft,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.homeScanCorner,
                  styles.homeScanCornerBottomRight,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.homeQrMark,
                  { backgroundColor: palette.greenSoft },
                ]}
              >
                <IconSymbol
                  name="qrcode.viewfinder"
                  size={82}
                  color={palette.green}
                />
              </View>
              <Animated.View
                style={[
                  styles.homeScanLine,
                  {
                    backgroundColor: palette.green,
                    shadowColor: palette.green,
                    transform: [
                      {
                        translateY: radarProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-122, 122],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <Text style={styles.homeScanTitle}>Scan before you pay</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan a payment QR"
              onPress={startScanner}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Scan a payment QR</Text>
              <Text style={styles.primaryButtonArrow}>→</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload QR image"
              onPress={uploadQrImage}
              style={({ pressed }) => [
                styles.uploadButton,
                pressed && styles.pressed,
              ]}
            >
              <IconSymbol
                name="qrcode.viewfinder"
                size={19}
                color={palette.blue}
              />
              <Text style={styles.uploadButtonText}>Upload QR image</Text>
            </Pressable>
            {uploadedImageUri ? (
              <Image
                source={{ uri: uploadedImageUri }}
                style={styles.uploadPreview}
              />
            ) : null}
            <View style={styles.trustRow}>
              <Text style={styles.trustText}>No UPI PIN</Text>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>No bank login</Text>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>Review before paying</Text>
            </View>
          </View>
        ) : (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.cardEyebrow}>UPI INTENT REVIEW</Text>
                <Text style={styles.resultTitle}>{result.headline}</Text>
              </View>
              <RiskBadge
                status={result.status}
                styles={styles}
                riskMeta={riskMeta}
              />
            </View>
            <RiskStatusCard result={result} palette={palette} />

            <View style={styles.recipientBlock}>
              <Text style={styles.recipientLabel}>PAYEE</Text>
              <Text style={styles.recipientName}>
                {result.payeeName || "Name not provided"}
              </Text>
              <Text style={styles.detailLabel}>UPI ID</Text>
              <Text style={styles.detailValue}>
                {result.payeeAddress || "Not found"}
              </Text>
              <Text style={styles.detailLabel}>AMOUNT</Text>
              <Text style={styles.recipientAmount}>
                {displayAmount(result)}
              </Text>
            </View>
            <View style={styles.detailList}>
              {result.note ? (
                <DetailRow label="NOTE" value={result.note} styles={styles} />
              ) : null}
              {result.merchantCategory ? (
                <DetailRow
                  label="CATEGORY"
                  value={result.merchantCategory}
                  styles={styles}
                />
              ) : null}
            </View>

            <View style={styles.explanationBox}>
              <View
                style={[
                  styles.explanationMark,
                  { backgroundColor: riskMeta[result.status].color },
                ]}
              >
                <Text style={styles.explanationMarkText}>
                  {riskMeta[result.status].icon}
                </Text>
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
              <Text style={styles.handoffWarningTitle}>
                Before you continue
              </Text>
              <Text style={styles.handoffWarningText}>
                Only enter your UPI PIN to send money. A UPI PIN is never
                required to receive money. QR Guard will not open your UPI app
                until the full VPA and payee name are shown above.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open in UPI app"
              onPress={openInUpiApp}
              disabled={!canProceed}
              style={({ pressed }) => [
                styles.primaryButton,
                !canProceed && styles.disabledButton,
                pressed && canProceed && styles.primaryButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !canProceed && styles.disabledButtonText,
                ]}
              >
                {canProceed ? "Open in UPI app" : "Recipient details required"}
              </Text>
              <Text
                style={[
                  styles.primaryButtonArrow,
                  !canProceed && styles.disabledButtonText,
                ]}
              >
                →
              </Text>
            </Pressable>
            <View style={styles.resultActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Report this QR code"
                onPress={() => {
                  triggerLightHaptic();
                  setReported(true);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {reported ? "Report received" : "Report QR"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Scan another QR code"
                onPress={resetReview}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Scan another</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </ScreenContainer>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    backgroundPattern: {
      ...StyleSheet.absoluteFillObject,
      overflow: "hidden",
    },
    ambientOrb: {
      position: "absolute",
      top: -125,
      right: -95,
      width: 310,
      height: 310,
      borderRadius: 155,
      borderWidth: 1,
      borderColor: "rgba(66, 221, 235, 0.12)",
      backgroundColor: "rgba(23, 118, 99, 0.08)",
    },
    circuitTrace: {
      position: "absolute",
      width: 200,
      height: 1,
      backgroundColor: "rgba(69, 242, 163, 0.12)",
    },
    circuitTraceOne: {
      top: 176,
      right: -74,
      transform: [{ rotate: "-36deg" }],
    },
    circuitTraceTwo: {
      top: 206,
      right: -112,
      transform: [{ rotate: "-36deg" }],
    },
    scrollContent: {
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 18,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    themeToggle: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    themeToggleText: {
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "700",
    },
    brandMark: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: palette.greenSoft,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    brandMarkInner: {
      width: 21,
      height: 21,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: palette.green,
      transform: [{ rotate: "45deg" }],
    },
    brandMarkCore: {
      position: "absolute",
      width: 6,
      height: 6,
      borderRadius: 2,
      backgroundColor: palette.blue,
      transform: [{ rotate: "45deg" }],
    },
    brandCopy: {
      flex: 1,
    },
    brandName: {
      color: palette.ink,
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
      backgroundColor: palette.card,
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
    homeScanContent: {
      width: "100%",
      alignItems: "center",
      paddingTop: 8,
    },
    homeEyebrow: {
      color: palette.blue,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.7,
    },
    homeScanFrame: {
      width: "100%",
      maxWidth: 245,
      aspectRatio: 1,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 28,
      overflow: "hidden",
    },
    homeScanCorner: {
      position: "absolute",
      width: 46,
      height: 46,
      zIndex: 1,
    },
    homeScanCornerTopLeft: {
      left: 16,
      top: 16,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 14,
    },
    homeScanCornerTopRight: {
      right: 16,
      top: 16,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 14,
    },
    homeScanCornerBottomLeft: {
      left: 16,
      bottom: 16,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 14,
    },
    homeScanCornerBottomRight: {
      right: 16,
      bottom: 16,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 14,
    },
    homeQrMark: {
      width: 126,
      height: 126,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 35,
    },
    homeScanLine: {
      position: "absolute",
      left: "12%",
      right: "12%",
      height: 2,
      opacity: 0.9,
      shadowOpacity: 0.8,
      shadowRadius: 9,
      elevation: 5,
    },
    homeScanTitle: {
      color: palette.ink,
      fontSize: 23,
      lineHeight: 29,
      fontWeight: "800",
      marginTop: 6,
    },
    homeScanSubtitle: {
      color: palette.inkSoft,
      fontSize: 13,
      textAlign: "center",
      marginTop: 4,
    },
    trustRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    trustText: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: "700",
    },
    trustDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: palette.green,
    },
    heroSection: {
      paddingTop: 34,
      paddingBottom: 18,
    },
    heroSectionWide: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    heroCopyWide: {
      flex: 1,
    },
    heroKicker: {
      color: palette.blue,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.8,
      marginBottom: 9,
    },
    heroTitle: {
      color: palette.ink,
      fontFamily:
        Platform.OS === "web"
          ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          : "System",
      fontSize: 37,
      lineHeight: 43,
      fontWeight: "800",
      letterSpacing: -1.2,
    },
    heroBody: {
      color: palette.inkSoft,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 13,
      maxWidth: 335,
    },
    securityVisual: {
      height: 148,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    securityVisualWide: {
      width: 190,
      height: 190,
      flexShrink: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    radarTrack: {
      position: "absolute",
      width: 142,
      height: 142,
      borderRadius: 71,
      borderWidth: 1,
      borderColor: "rgba(66, 221, 235, 0.3)",
      backgroundColor: "rgba(19, 91, 79, 0.08)",
    },
    radarPulse: {
      position: "absolute",
      width: 126,
      height: 126,
      borderRadius: 63,
      borderWidth: 1,
      borderColor: "rgba(69, 242, 163, 0.72)",
      backgroundColor: "rgba(69, 242, 163, 0.08)",
    },
    shieldAura: {
      width: 94,
      height: 94,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.greenSoft,
      borderWidth: 1,
      borderColor: palette.green,
      shadowColor: palette.green,
      shadowOpacity: 0.38,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    },
    heroShield: {
      width: 52,
      height: 52,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.greenSoft,
      borderWidth: 1,
      borderColor: palette.green,
      transform: [{ rotate: "45deg" }],
    },
    heroShieldCheck: {
      color: palette.green,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: "800",
      transform: [{ rotate: "-45deg" }],
    },
    localCheckPill: {
      position: "absolute",
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 99,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.line,
    },
    localCheckDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.green,
    },
    localCheckText: {
      color: palette.inkSoft,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1,
    },
    scanCard: {
      backgroundColor: palette.card,
      borderRadius: 26,
      padding: 20,
      borderWidth: 1,
      borderColor: palette.line,
      shadowColor: palette.green,
      shadowOpacity: 0.16,
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
    scanCardEyebrow: {
      color: palette.blue,
    },
    scanCardTitle: {
      color: palette.ink,
      fontSize: 26,
      lineHeight: 31,
      fontWeight: "700",
    },
    shieldIcon: {
      width: 45,
      height: 45,
      borderRadius: 15,
      backgroundColor: palette.greenSoft,
      borderWidth: 1,
      borderColor: palette.green,
      alignItems: "center",
      justifyContent: "center",
    },
    shieldIconText: {
      color: palette.green,
      fontSize: 28,
      lineHeight: 28,
      transform: [{ rotate: "180deg" }],
    },
    scanCardBody: {
      color: palette.inkSoft,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 15,
      marginBottom: 20,
    },
    primaryButton: {
      width: "100%",
      maxWidth: 380,
      minHeight: 54,
      borderRadius: 15,
      backgroundColor: palette.green,
      shadowColor: palette.green,
      shadowOpacity: 0.48,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
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
      backgroundColor: palette.line,
    },
    disabledButtonText: {
      color: palette.muted,
    },
    primaryButtonText: {
      color: palette.buttonText,
      fontSize: 15,
      fontWeight: "700",
    },
    primaryButtonArrow: {
      color: palette.buttonText,
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
      color: palette.inkSoft,
      fontSize: 13,
      fontWeight: "600",
    },
    demoButtonArrow: {
      color: palette.blue,
      fontSize: 16,
    },
    uploadButton: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      marginTop: 8,
      paddingVertical: 6,
    },
    uploadButtonIcon: {
      color: palette.blue,
      fontSize: 16,
      fontWeight: "800",
    },
    uploadButtonText: {
      color: palette.blue,
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
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.line,
    },
    sampleDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    sampleChipText: {
      color: palette.inkSoft,
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
      shadowOpacity: 0.35,
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
      borderWidth: 1,
      shadowColor: palette.green,
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    statusHeroIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      shadowColor: palette.green,
      shadowOpacity: 0.32,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    statusHeroIconText: {
      color: "#062016",
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
      color: palette.ink,
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
      color: palette.ink,
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
      color: palette.ink,
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
      color: "#06100F",
      fontSize: 10,
      fontWeight: "800",
    },
    riskBadgeText: {
      fontSize: 11,
      fontWeight: "800",
    },
    recipientBlock: {
      backgroundColor: palette.card,
      borderRadius: 17,
      padding: 15,
      marginTop: 20,
      borderWidth: 1,
      borderColor: palette.line,
    },
    recipientLabel: {
      color: palette.muted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    recipientName: {
      color: palette.ink,
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
      color: palette.ink,
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
      backgroundColor: palette.card,
      borderRadius: 14,
      padding: 12,
      marginTop: 15,
      borderWidth: 1,
      borderColor: palette.line,
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
      backgroundColor: palette.amberSoft,
      borderRadius: 14,
      padding: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: palette.amber,
    },
    handoffWarningTitle: {
      color: palette.amber,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    handoffWarningText: {
      color: palette.inkSoft,
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
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.line,
    },
    secondaryButtonText: {
      color: palette.ink,
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
      backgroundColor: palette.paper,
    },
    scannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(4, 16, 14, 0.62)",
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
      backgroundColor: "rgba(5, 24, 20, 0.82)",
      borderWidth: 1,
      borderColor: "rgba(69, 242, 163, 0.45)",
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
      color: palette.blue,
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
      borderColor: "rgba(66, 221, 235, 0.5)",
      backgroundColor: "rgba(7, 25, 22, 0.18)",
      position: "relative",
    },
    corner: {
      position: "absolute",
      width: 38,
      height: 38,
      borderColor: palette.green,
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
      backgroundColor: "rgba(5, 24, 20, 0.88)",
      borderWidth: 1,
      borderColor: "rgba(69, 242, 163, 0.35)",
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.green,
    },
    scanHintText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    scanHintSecondary: {
      color: "#D0E4DC",
      fontSize: 12,
      marginTop: 10,
    },
  });
}

type HomeStyles = ReturnType<typeof createStyles>;
