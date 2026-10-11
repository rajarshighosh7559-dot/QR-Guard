import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getAppPalette } from "@/constants/app-palette";
import { PageHeader } from "@/components/page-header";
import { ScreenContainer } from "@/components/screen-container";
import { useThemeContext } from "@/lib/theme-provider";
import {
  blockedDemoUpiPayload,
  demoUpiPayload,
  parseUpiQr,
  suspiciousDemoUpiPayload,
  type RiskStatus,
  type UpiPayload,
} from "@/lib/upi";

const examples = [
  { title: "Routine payment QR", payload: demoUpiPayload },
  { title: "Unusual recipient details", payload: suspiciousDemoUpiPayload },
  { title: "QR blocked for review", payload: blockedDemoUpiPayload },
];

const riskDetails: Record<
  RiskStatus,
  { label: string; color: keyof ReturnType<typeof getAppPalette> }
> = {
  valid: { label: "Valid", color: "green" },
  unverified: { label: "Unverified", color: "amber" },
  suspicious: { label: "Suspicious", color: "red" },
  blocked: { label: "Blocked", color: "red" },
};

export default function LearnScreen() {
  const { colorScheme } = useThemeContext();
  const palette = useMemo(() => getAppPalette(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [selectedExample, setSelectedExample] = useState<UpiPayload | null>(
    null,
  );

  return (
    <ScreenContainer className="p-0" containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader />
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PAYMENT SAFETY</Text>
          <Text style={styles.title}>Why this is safe</Text>
          <Text style={styles.subtitle}>
            QR Guard checks the UPI intent on this device before you choose to
            open it in your UPI app.
          </Text>
        </View>

        <View style={styles.assuranceCard}>
          <Text style={styles.assuranceTitle}>
            A format check, not a bank verification
          </Text>
          <Text style={styles.assuranceText}>
            QR Guard never asks for your UPI PIN or bank login. It checks
            payment format and visible recipient details, but cannot verify who
            owns an account or guarantee a payment is safe. Confirm the payee
            and amount in your UPI app before paying.
          </Text>
        </View>

        <View style={styles.tipList}>
          <TipCard
            number="01"
            title="A UPI PIN sends money"
            text="Never enter your UPI PIN to receive money, claim a refund, or verify your account."
            styles={styles}
          />
          <TipCard
            number="02"
            title="Confirm the recipient"
            text="Check the payee name, UPI ID, and amount before opening your UPI app. A QR code alone does not prove who will receive the payment."
            styles={styles}
          />
          <TipCard
            number="03"
            title="Review the amount"
            text="Make sure the amount and any payment note match what you intended. Stop if anything looks unexpected."
            styles={styles}
          />
          <TipCard
            number="04"
            title="A valid QR is not a guarantee"
            text="QR Guard checks the visible payment details locally. Always make your final decision in your UPI app."
            styles={styles}
          />
        </View>

        <Text style={styles.sectionTitle}>Explore sample reviews</Text>
        <Text style={styles.sectionSubtitle}>
          These examples are processed on this device and do not initiate
          payments.
        </Text>
        <View style={styles.exampleList}>
          {examples.map((example) => (
            <Pressable
              key={example.title}
              accessibilityRole="button"
              onPress={() => setSelectedExample(parseUpiQr(example.payload))}
              style={({ pressed }) => [
                styles.exampleButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.exampleButtonText}>{example.title}</Text>
              <Text style={styles.exampleArrow}>→</Text>
            </Pressable>
          ))}
        </View>
        {selectedExample ? (
          <View style={styles.exampleResult}>
            <Text style={styles.eyebrow}>SAMPLE RESULT</Text>
            <Text
              style={[
                styles.exampleStatus,
                { color: palette[riskDetails[selectedExample.status].color] },
              ]}
            >
              {riskDetails[selectedExample.status].label}
            </Text>
            <Text style={styles.exampleHeadline}>
              {selectedExample.headline}
            </Text>
            <Text style={styles.exampleExplanation}>
              {selectedExample.explanation}
            </Text>
            <Text style={styles.exampleRecipient}>
              {selectedExample.payeeName || "Name not provided"} ·{" "}
              {selectedExample.payeeAddress || "UPI ID not found"}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function TipCard({
  number,
  title,
  text,
  styles,
}: {
  number: string;
  title: string;
  text: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.tipCard}>
      <Text style={styles.tipNumber}>{number}</Text>
      <View style={styles.tipCopy}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipText}>{text}</Text>
      </View>
    </View>
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
    subtitle: {
      color: palette.inkSoft,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 6,
    },
    assuranceCard: {
      padding: 15,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.greenSoft,
      marginBottom: 14,
    },
    assuranceTitle: {
      color: palette.ink,
      fontSize: 14,
      fontWeight: "800",
    },
    assuranceText: {
      color: palette.inkSoft,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
    },
    tipList: { gap: 10 },
    tipCard: {
      flexDirection: "row",
      gap: 13,
      padding: 15,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.card,
    },
    tipNumber: {
      color: palette.green,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
    },
    tipCopy: { flex: 1 },
    tipTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
    tipText: {
      color: palette.inkSoft,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    sectionTitle: {
      color: palette.ink,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 26,
    },
    sectionSubtitle: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    exampleList: { gap: 8, marginTop: 12 },
    exampleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 13,
      paddingHorizontal: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.card,
    },
    exampleButtonText: { color: palette.ink, fontSize: 13, fontWeight: "700" },
    exampleArrow: { color: palette.blue, fontSize: 18, fontWeight: "700" },
    exampleResult: {
      padding: 16,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.card,
    },
    exampleStatus: { fontSize: 20, fontWeight: "900", marginTop: 7 },
    exampleHeadline: {
      color: palette.ink,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 4,
    },
    exampleExplanation: {
      color: palette.inkSoft,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
    },
    exampleRecipient: { color: palette.muted, fontSize: 11, marginTop: 10 },
    pressed: { opacity: 0.7 },
  });
}
