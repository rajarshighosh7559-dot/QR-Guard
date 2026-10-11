import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { getAppPalette } from "@/constants/app-palette";
import { useThemeContext } from "@/lib/theme-provider";

export function PageHeader() {
  const { colorScheme, setColorScheme } = useThemeContext();
  const router = useRouter();
  const palette = useMemo(() => getAppPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.row}>
      <View style={styles.brandMark}>
        <View style={styles.brandMarkInner} />
        <View style={styles.brandMarkCore} />
      </View>
      <View style={styles.brandCopy}>
        <Text style={styles.brandName}>QR GUARD</Text>
        <Text style={styles.brandCaption}>scan before you pay</Text>
      </View>
      <View style={styles.privacyGroup}>
        <View style={styles.privacyPill}>
          <View style={styles.privacyDot} />
          <Text style={styles.privacyText}>PRIVATE</Text>
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Why this is safe"
          onPress={() => router.push("/learn")}
          hitSlop={6}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.privacyLink}>Why this is safe</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${colorScheme === "dark" ? "light" : "dark"} mode`}
        onPress={() =>
          setColorScheme(colorScheme === "dark" ? "light" : "dark")
        }
        style={({ pressed }) => [styles.themeToggle, pressed && styles.pressed]}
      >
        <Text style={styles.themeToggleText}>
          {colorScheme === "dark" ? "☀" : "☾"}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof getAppPalette>) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      width: "100%",
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
    privacyGroup: {
      alignItems: "center",
      gap: 5,
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
    privacyLink: {
      color: palette.muted,
      fontSize: 9,
      fontWeight: "600",
      textDecorationLine: "underline",
      textDecorationColor: palette.line,
    },
    themeToggle: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.card,
      alignItems: "center",
      justifyContent: "center",
    },
    themeToggleText: {
      color: palette.blue,
      fontSize: 19,
      lineHeight: 23,
      fontWeight: "700",
    },
    pressed: {
      opacity: 0.68,
    },
  });
}
