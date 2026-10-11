import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getAppPalette } from "@/constants/app-palette";
import { getRiskGuidance } from "@/lib/risk-guidance";
import type { UpiPayload } from "@/lib/upi";

type Palette = ReturnType<typeof getAppPalette>;

export function RiskStatusCard({
  result,
  palette,
}: {
  result: UpiPayload;
  palette: Palette;
}) {
  const guidance = useMemo(() => getRiskGuidance(result), [result]);
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.list}>
      {guidance.map((message, index) => {
        const color =
          message.label === "Safe"
            ? palette.success
            : message.label === "Review"
              ? palette.amber
              : palette.red;
        const background =
          message.label === "Safe"
            ? palette.greenSoft
            : message.label === "Review"
              ? palette.amberSoft
              : palette.redSoft;
        return (
          <View
            accessibilityRole="summary"
            key={`${message.label}-${index}`}
            style={[
              styles.card,
              { backgroundColor: background, borderColor: color },
            ]}
          >
            <View style={styles.heading}>
              <View style={[styles.statusDot, { backgroundColor: color }]} />
              <Text style={[styles.label, { color }]}>{message.label}</Text>
            </View>
            <Text style={[styles.title, { color }]}>{message.title}</Text>
            <Text style={styles.detail}>{message.detail}</Text>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    list: {
      gap: 8,
    },
    card: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
    },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    label: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    title: {
      fontSize: 15,
      fontWeight: "800",
      marginTop: 7,
    },
    detail: {
      color: palette.inkSoft,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
  });
}
