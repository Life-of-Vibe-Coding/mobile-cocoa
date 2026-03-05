/**
 * NoProviderBanner
 *
 * Shown when the server has no LLM provider credentials configured.
 * Guides the user through running `pi` + `/login` to authenticate.
 */
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useTheme } from "@/theme/index";

type Step = { cmd: string; desc: string };
const STEPS: Step[] = [
  { cmd: "npm install -g @mariozechner/pi-coding-agent", desc: "Install Pi (skip if already done)" },
  { cmd: "pi", desc: "Open Pi in your terminal" },
  { cmd: "/login", desc: "Type this inside Pi and follow the prompts" },
];

export const NoProviderBanner = memo(function NoProviderBanner() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <VStack space="md">
        {/* Header */}
        <VStack space="xs">
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            🔑 No AI provider connected
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Run the following commands in your Mac terminal to connect an LLM provider:
          </Text>
        </VStack>

        {/* Steps */}
        <VStack space="sm">
          {STEPS.map((step, i) => (
            <View key={i} style={[styles.stepRow, { backgroundColor: theme.colors.surfaceAlt }]}>
              <View style={[styles.stepIndex, { backgroundColor: theme.colors.accent }]}>
                <Text style={styles.stepIndexText}>{i + 1}</Text>
              </View>
              <VStack style={styles.stepContent} space="xs">
                <View style={[styles.codeBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                  <Text
                    style={[styles.codeText, { color: theme.colors.textPrimary }]}
                    selectable
                  >
                    {step.cmd}
                  </Text>
                </View>
                <Text style={[styles.stepDesc, { color: theme.colors.textMuted }]}>{step.desc}</Text>
              </VStack>
            </View>
          ))}
        </VStack>

        {/* Supported providers */}
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Supported providers: Claude (Anthropic), Gemini (Google), Codex (OpenAI)
        </Text>
      </VStack>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: 8,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  stepIndexText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  stepContent: {
    flex: 1,
  },
  codeBox: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 12,
  },
  stepDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
});
