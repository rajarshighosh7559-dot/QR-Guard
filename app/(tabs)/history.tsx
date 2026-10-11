import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getAppPalette } from "@/constants/app-palette";
import { PageHeader } from "@/components/page-header";
import { ScreenContainer } from "@/components/screen-container";
import { useThemeContext } from "@/lib/theme-provider";
import type { RiskStatus } from "@/lib/upi";

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

const riskDetails: Record<
  RiskStatus,
  { label: string; color: keyof ReturnType<typeof getAppPalette> }
> = {
  valid: { label: "Valid", color: "green" },
  unverified: { label: "Unverified", color: "amber" },
  suspicious: { label: "Suspicious", color: "red" },
  blocked: { label: "Blocked", color: "red" },
};

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

export default function HistoryScreen() {
  const { colorScheme } = useThemeContext();
  const palette = useMemo(() => getAppPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [scans, setScans] = useState<RecentScan[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void AsyncStorage.getItem(HISTORY_KEY)
        .then((value) => {
          if (!isActive) return;
          const saved = value ? (JSON.parse(value) as unknown) : [];
          setScans(Array.isArray(saved) ? saved.filter(isRecentScan) : []);
          setHasLoaded(true);
        })
        .catch((error) => {
          console.error("Could not load recent QR scans.", error);
          if (isActive) {
            setScans([]);
            setHasLoaded(true);
          }
        });
      return () => {
        isActive = false;
      };
    }, []),
  );

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>ON THIS DEVICE</Text>
          <Text style={styles.title}>Scan history</Text>
          <Text style={styles.subtitle}>
            Your recent QR reviews stay private on this device.
          </Text>
        </View>
        {!hasLoaded ? null : scans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptyText}>
              QR codes you review will appear here for quick reference.
            </Text>
          </View>
        ) : (
          <View style={styles.scanList}>
            {scans.map((scan) => {
              const risk = riskDetails[scan.status];
              const timestamp = new Date(scan.scannedAt);
              const dateLabel = Number.isNaN(timestamp.getTime())
                ? "Recently scanned"
                : timestamp.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  });
              return (
                <View key={scan.id} style={styles.scanCard}>
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: palette[risk.color] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusLabel,
                        { color: palette[risk.color] },
                      ]}
                    >
                      {risk.label}
                    </Text>
                    <Text style={styles.dateLabel}>{dateLabel}</Text>
                  </View>
                  <Text style={styles.payeeName} numberOfLines={1}>
                    {scan.payeeName}
                  </Text>
                  <Text style={styles.payeeAddress} numberOfLines={1}>
                    {scan.payeeAddress}
                  </Text>
                  <View style={styles.cardBottom}>
                    <Text style={styles.headline} numberOfLines={1}>
                      {scan.headline}
                    </Text>
                    <Text style={styles.amount}>{scan.amount}</Text>
                  </View>
                </View>
              );
            })}
          </View>
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
    },
    titleBlock: { marginTop: 32, marginBottom: 18 },
    eyebrow: {
      color: palette.blue,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.5,
    },
    title: {
      color: palette.ink,
      fontSize: 28,
      fontWeight: "800",
      marginTop: 5,
    },
    subtitle: { color: palette.inkSoft, fontSize: 13, marginTop: 6 },
    emptyCard: {
      padding: 24,
      backgroundColor: palette.card,
      borderColor: palette.line,
      borderWidth: 1,
      borderRadius: 20,
      alignItems: "center",
    },
    emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" },
    emptyText: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      marginTop: 7,
    },
    scanList: { gap: 10 },
    scanCard: {
      padding: 15,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.card,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusLabel: { fontSize: 10, fontWeight: "800" },
    dateLabel: { color: palette.muted, fontSize: 10, marginLeft: "auto" },
    payeeName: {
      color: palette.ink,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 11,
    },
    payeeAddress: { color: palette.muted, fontSize: 12, marginTop: 3 },
    cardBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 12,
    },
    headline: { flex: 1, color: palette.inkSoft, fontSize: 11 },
    amount: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  });
}
