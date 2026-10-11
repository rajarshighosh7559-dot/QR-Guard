import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getAppPalette } from "@/constants/app-palette";
import { PageHeader } from "@/components/page-header";
import { RiskStatusCard } from "@/components/risk-status-card";
import { ScreenContainer } from "@/components/screen-container";
import { useThemeContext } from "@/lib/theme-provider";
import {
  displayAmount,
  parseUpiQr,
  type RiskStatus,
  type UpiPayload,
} from "@/lib/upi";

const HISTORY_KEY = "qr-guard.recent-scans.v1";

const statusCopy: Record<RiskStatus, string> = {
  valid: "Valid",
  unverified: "Unverified",
  suspicious: "Suspicious",
  blocked: "Blocked",
};

export default function ScanScreen() {
  const { colorScheme } = useThemeContext();
  const palette = useMemo(() => getAppPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<UpiPayload | null>(null);
  const scanLineProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineProgress, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineProgress, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scanLineProgress]);

  async function startScanner() {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to scan a payment QR. QR Guard does not read your UPI PIN or bank credentials.",
        );
        return;
      }
    }
    setResult(null);
    setIsScanning(true);
  }

  async function handleBarcodeScanned({ data }: BarcodeScanningResult) {
    if (!isScanning) return;
    const parsed = parseUpiQr(data);
    setResult(parsed);
    setIsScanning(false);

    const scan = {
      id: `${Date.now()}-${parsed.status}`,
      status: parsed.status,
      payeeName: parsed.payeeName || "Name not provided",
      payeeAddress: parsed.payeeAddress || "Not found",
      amount: displayAmount(parsed),
      headline: parsed.headline,
      scannedAt: new Date().toISOString(),
    };
    try {
      const value = await AsyncStorage.getItem(HISTORY_KEY);
      const previous = value ? (JSON.parse(value) as (typeof scan)[]) : [];
      await AsyncStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([scan, ...previous].slice(0, 5)),
      );
    } catch (error) {
      console.error("Could not save the recent QR scan.", error);
    }
  }

  async function continueToUpiApp() {
    if (!result?.isUpi || !result.payeeName || !result.payeeAddress) return;
    try {
      if (await Linking.canOpenURL(result.raw)) {
        await Linking.openURL(result.raw);
      } else if (Platform.OS === "web") {
        Alert.alert(
          "Ready for handoff",
          "Open your preferred UPI app on your phone after confirming the recipient and amount.",
        );
      } else {
        Alert.alert(
          "No UPI app found",
          "Install a supported UPI app, then try again.",
        );
      }
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
        className="p-0"
        containerClassName="bg-background"
      >
        <View style={styles.cameraScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.cameraOverlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
              onPress={() => setIsScanning(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
            <View style={styles.cameraFrame}>
              <View style={styles.cameraCornerTopLeft} />
              <View style={styles.cameraCornerTopRight} />
              <View style={styles.cameraCornerBottomLeft} />
              <View style={styles.cameraCornerBottomRight} />
            </View>
            <Text style={styles.cameraHint}>Point at a payment QR</Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />
        {result ? (
          <View
            style={[
              styles.resultCard,
              { borderColor: palette.line, backgroundColor: palette.card },
            ]}
          >
            <Text style={[styles.eyebrow, { color: palette.blue }]}>
              UPI INTENT REVIEW
            </Text>
            <Text
              style={[
                styles.resultStatus,
                {
                  color:
                    palette[
                      result.status === "valid"
                        ? "green"
                        : result.status === "unverified"
                          ? "amber"
                          : "red"
                    ],
                },
              ]}
            >
              {statusCopy[result.status]}
            </Text>
            <Text style={[styles.resultHeadline, { color: palette.ink }]}>
              {result.headline}
            </Text>
            <View
              style={[
                styles.recipient,
                { backgroundColor: palette.paper, borderColor: palette.line },
              ]}
            >
              <Text style={[styles.detailLabel, { color: palette.muted }]}>
                PAYEE
              </Text>
              <Text style={[styles.detailValue, { color: palette.ink }]}>
                {result.payeeName || "Name not provided"}
              </Text>
              <Text style={[styles.detailLabel, { color: palette.muted }]}>
                UPI ID
              </Text>
              <Text style={[styles.detailValue, { color: palette.ink }]}>
                {result.payeeAddress || "Not found"}
              </Text>
              <Text style={[styles.detailLabel, { color: palette.muted }]}>
                AMOUNT
              </Text>
              <Text style={[styles.amount, { color: palette.blue }]}>
                {displayAmount(result)}
              </Text>
            </View>
            <RiskStatusCard result={result} palette={palette} />
            <Text style={[styles.explanation, { color: palette.inkSoft }]}>
              {result.explanation}
            </Text>
            <Text style={[styles.safetyNote, { color: palette.muted }]}>
              Confirm the payee and amount in your UPI app. Never enter a UPI
              PIN to receive money.
            </Text>
            <Pressable
              onPress={continueToUpiApp}
              disabled={
                !result.isUpi || !result.payeeName || !result.payeeAddress
              }
              style={({ pressed }) => [
                styles.primaryButton,
                !result.isUpi || !result.payeeName || !result.payeeAddress
                  ? styles.disabledButton
                  : null,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Open in UPI app</Text>
            </Pressable>
            <Pressable
              onPress={() => setResult(null)}
              style={styles.textButton}
            >
              <Text style={[styles.textButtonText, { color: palette.blue }]}>
                Back to scanner
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.eyebrow, { color: palette.blue }]}>
              READY TO REVIEW A UPI INTENT
            </Text>
            <View
              style={[
                styles.scanFrame,
                { backgroundColor: palette.card, borderColor: palette.line },
              ]}
            >
              <View
                style={[
                  styles.frameCorner,
                  styles.frameCornerTopLeft,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.frameCorner,
                  styles.frameCornerTopRight,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.frameCorner,
                  styles.frameCornerBottomLeft,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[
                  styles.frameCorner,
                  styles.frameCornerBottomRight,
                  { borderColor: palette.green },
                ]}
              />
              <View
                style={[styles.qrIcon, { backgroundColor: palette.greenSoft }]}
              >
                <Text style={[styles.qrIconText, { color: palette.green }]}>
                  ▦
                </Text>
              </View>
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: palette.green,
                    transform: [
                      {
                        translateY: scanLineProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-120, 120],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <Text style={[styles.title, { color: palette.ink }]}>
              Scan before you pay
            </Text>
            <Text style={[styles.subtitle, { color: palette.inkSoft }]}>
              Keep the QR code centered. We check it on this device before your
              payment app opens.
            </Text>
            <Pressable
              onPress={startScanner}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Open camera</Text>
            </Pressable>
            <Text style={[styles.trustText, { color: palette.muted }]}>
              No UPI PIN · No bank login · Review before paying
            </Text>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(palette: ReturnType<typeof getAppPalette>) {
  return StyleSheet.create({
    content: {
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      alignItems: "center",
    },
    eyebrow: {
      alignSelf: "flex-start",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.6,
      marginTop: 30,
    },
    scanFrame: {
      width: "100%",
      maxWidth: 330,
      aspectRatio: 1,
      borderWidth: 1,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginTop: 16,
    },
    frameCorner: {
      position: "absolute",
      width: 42,
      height: 42,
      zIndex: 1,
    },
    frameCornerTopLeft: {
      top: 16,
      left: 16,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderTopLeftRadius: 14,
    },
    frameCornerTopRight: {
      top: 16,
      right: 16,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderTopRightRadius: 14,
    },
    frameCornerBottomLeft: {
      bottom: 16,
      left: 16,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderBottomLeftRadius: 14,
    },
    frameCornerBottomRight: {
      bottom: 16,
      right: 16,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderBottomRightRadius: 14,
    },
    qrIcon: {
      width: 112,
      height: 112,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 30,
    },
    qrIconText: { fontSize: 72, fontWeight: "600" },
    scanLine: {
      position: "absolute",
      left: "12%",
      right: "12%",
      height: 2,
      opacity: 0.9,
    },
    title: { fontSize: 24, fontWeight: "800", marginTop: 22 },
    subtitle: {
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 8,
      maxWidth: 370,
    },
    primaryButton: {
      width: "100%",
      maxWidth: 380,
      minHeight: 54,
      borderRadius: 15,
      backgroundColor: palette.green,
      marginTop: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: palette.buttonText,
      fontSize: 15,
      fontWeight: "800",
    },
    disabledButton: { opacity: 0.45 },
    pressed: { opacity: 0.75 },
    trustText: {
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 20,
    },
    resultCard: {
      width: "100%",
      borderWidth: 1,
      borderRadius: 22,
      padding: 20,
      marginTop: 30,
    },
    resultStatus: { fontSize: 21, fontWeight: "900", marginTop: 8 },
    resultHeadline: { fontSize: 17, fontWeight: "700", marginTop: 4 },
    recipient: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 18 },
    detailLabel: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
      marginTop: 6,
    },
    detailValue: { fontSize: 17, fontWeight: "700", marginTop: 5 },
    amount: { fontSize: 19, fontWeight: "800", marginTop: 5 },
    explanation: { fontSize: 13, lineHeight: 19, marginTop: 16 },
    safetyNote: { fontSize: 12, lineHeight: 18, marginTop: 14 },
    textButton: { alignSelf: "center", paddingVertical: 14 },
    textButtonText: { fontSize: 13, fontWeight: "700" },
    cameraScreen: { flex: 1, backgroundColor: palette.paper },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 20,
      paddingBottom: 30,
    },
    closeButton: {
      alignSelf: "flex-start",
      marginLeft: 16,
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(5, 24, 20, 0.82)",
    },
    closeButtonText: { color: "#FFFFFF", fontSize: 28, lineHeight: 30 },
    cameraFrame: {
      width: "84%",
      maxWidth: 380,
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: palette.blue,
      borderRadius: 28,
    },
    cameraCornerTopLeft: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 38,
      height: 38,
      borderTopWidth: 4,
      borderLeftWidth: 4,
      borderColor: palette.green,
      borderTopLeftRadius: 14,
    },
    cameraCornerTopRight: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 38,
      height: 38,
      borderTopWidth: 4,
      borderRightWidth: 4,
      borderColor: palette.green,
      borderTopRightRadius: 14,
    },
    cameraCornerBottomLeft: {
      position: "absolute",
      bottom: 0,
      left: 0,
      width: 38,
      height: 38,
      borderBottomWidth: 4,
      borderLeftWidth: 4,
      borderColor: palette.green,
      borderBottomLeftRadius: 14,
    },
    cameraCornerBottomRight: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 38,
      height: 38,
      borderBottomWidth: 4,
      borderRightWidth: 4,
      borderColor: palette.green,
      borderBottomRightRadius: 14,
    },
    cameraHint: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  });
}
