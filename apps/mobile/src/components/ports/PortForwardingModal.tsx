import {
  AttachPlusIcon,
  CloseIcon,
  PortForwardIcon,
  RefreshCwIcon,
  TrashIcon,
} from "@/components/icons/ChatActionIcons";
import { ListSectionCard } from "@/components/reusable/ListSectionCard";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { spacing, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Platform, StyleSheet, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { RefreshControl } from "@/components/ui/refresh-control";
import { ScrollView } from "@/components/ui/scroll-view";

type ExposedPort = {
  port: number;
  label: string;
  builtin?: boolean;
};

export interface PortForwardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  onApplied?: () => void;
}

export function PortForwardingModal({
  isOpen,
  onClose,
  serverBaseUrl,
  onApplied,
}: PortForwardingModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [ports, setPorts] = useState<ExposedPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [newPort, setNewPort] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [refreshPressed, setRefreshPressed] = useState(false);
  const [closePressed, setClosePressed] = useState(false);

  const fetchPorts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${serverBaseUrl}/api/ports`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setPorts(data.exposedPorts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ports");
      setPorts([]);
    }
  }, [serverBaseUrl]);

  const load = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);
      await fetchPorts();
      setLoading(false);
      setRefreshing(false);
    },
    [fetchPorts]
  );

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleAddPort = useCallback(async () => {
    const portNum = parseInt(newPort, 10);
    if (!portNum || portNum < 1024 || portNum > 65535) {
      showAlert("Invalid Port", "Port must be between 1024 and 65535.");
      return;
    }
    triggerHaptic("selection");
    Keyboard.dismiss();
    try {
      const res = await fetch(`${serverBaseUrl}/api/ports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: portNum, label: newLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add port");
      setPorts(data.exposedPorts ?? []);
      setNewPort("");
      setNewLabel("");
    } catch (err) {
      showAlert("Error", err instanceof Error ? err.message : "Failed to add port");
    }
  }, [newPort, newLabel, serverBaseUrl]);

  const handleRemovePort = useCallback(
    async (port: number) => {
      triggerHaptic("warning");
      showAlert("Remove Port?", `Stop exposing port ${port} through the tunnel?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            triggerHaptic("error");
            try {
              const res = await fetch(`${serverBaseUrl}/api/ports/${port}`, {
                method: "DELETE",
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error ?? "Failed to remove port");
              setPorts(data.exposedPorts ?? []);
            } catch (err) {
              showAlert("Error", err instanceof Error ? err.message : "Failed to remove port");
            }
          },
        },
      ]);
    },
    [serverBaseUrl]
  );

  const handleApply = useCallback(async () => {
    triggerHaptic("medium");
    setApplying(true);
    try {
      const res = await fetch(`${serverBaseUrl}/api/ports/apply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to apply");
      setPorts(data.exposedPorts ?? []);
      onApplied?.();
    } catch (err) {
      showAlert("Error", err instanceof Error ? err.message : "Failed to apply port configuration");
    } finally {
      setApplying(false);
    }
  }, [serverBaseUrl, onApplied]);

  const containerStyle = useMemo(
    () => ({ backgroundColor: theme.colors.background, paddingTop: insets.top }),
    [theme.colors.background, insets.top]
  );
  const headerDividerStyle = useMemo(
    () => ({
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: `${theme.colors.accent}38`,
    }),
    [theme.colors.accent]
  );
  const statPillStyle = useMemo(
    () => ({
      backgroundColor: `${theme.colors.accent}14`,
      borderColor: `${theme.colors.accent}30`,
    }),
    [theme.colors.accent]
  );
  const heroCardStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderColor: `${theme.colors.accent}30`,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    }),
    [theme.colors.accent, theme.colors.shadow, theme.colors.surface]
  );
  const sectionCardStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}2A`,
      backgroundColor: theme.colors.surface,
    }),
    [theme.colors.accent, theme.colors.surface]
  );
  const errorBannerStyle = useMemo(
    () => ({
      backgroundColor: `${theme.colors.danger}12`,
      borderColor: `${theme.colors.danger}25`,
    }),
    [theme.colors.danger]
  );
  const refreshButtonStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}35`,
      backgroundColor: `${theme.colors.accent}12`,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    }),
    [theme.colors.accent]
  );
  const pressedActionButtonStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}AA`,
      backgroundColor: `${theme.colors.accent}2C`,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 5,
      transform: [{ scale: 0.97 }] as const,
    }),
    [theme.colors.accent]
  );
  const topActionIconStyle = useMemo(
    () => ({ color: theme.colors.textMuted }),
    [theme.colors.textMuted]
  );
  const textPrimaryStyle = useMemo(
    () => ({ color: theme.colors.textPrimary }),
    [theme.colors.textPrimary]
  );
  const textSecondaryStyle = useMemo(
    () => ({ color: theme.colors.textSecondary }),
    [theme.colors.textSecondary]
  );
  const inputStyle = useMemo(
    () => ({
      backgroundColor: `${theme.colors.accent}0A`,
      borderColor: `${theme.colors.accent}30`,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 12 : 10,
      color: theme.colors.textPrimary,
      fontSize: 14,
    }),
    [theme.colors.accent, theme.colors.textPrimary]
  );

  const builtinPorts = useMemo(() => ports.filter((p) => p.builtin), [ports]);
  const userPorts = useMemo(() => ports.filter((p) => !p.builtin), [ports]);

  const handleRefreshPress = useCallback(() => {
    triggerHaptic("selection");
    load(true);
  }, [load]);

  if (!isOpen) return null;

  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Port Forwarding"
      showHeader={false}
      showCloseButton={false}
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
      bodyClassName="m-0 p-0 flex-1"
      bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
    >
      <Box className="flex-1" style={containerStyle}>
        <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
          <HStack className="items-center justify-between px-5 py-3 border-b" style={headerDividerStyle}>
            <HStack className="flex-1 items-center gap-3">
              <Box
                className="h-10 w-10 rounded-xl items-center justify-center border"
                style={statPillStyle}
              >
                <PortForwardIcon color={theme.colors.accent} size={18} />
              </Box>
              <Box className="flex-1 min-w-0">
                <Text size="xl" bold style={textPrimaryStyle}>
                  Port Forwarding
                </Text>
                <Text size="xs" className="mt-0.5" style={textSecondaryStyle}>
                  Cloudflare tunnel port exposure
                </Text>
              </Box>
            </HStack>
            <HStack className="items-center gap-1">
              <Button
                action="default"
                variant="outline"
                size="sm"
                onPress={handleRefreshPress}
                onPressIn={() => setRefreshPressed(true)}
                onPressOut={() => setRefreshPressed(false)}
                accessibilityLabel="Refresh port list"
                className="min-w-11 min-h-11 rounded-xl border"
                style={[refreshButtonStyle, refreshPressed && pressedActionButtonStyle]}
              >
                <ButtonIcon as={RefreshCwIcon} size="md" color={theme.colors.accent} />
              </Button>
              <Button
                action="default"
                variant="link"
                size="md"
                onPress={onClose}
                onPressIn={() => setClosePressed(true)}
                onPressOut={() => setClosePressed(false)}
                accessibilityLabel="Close"
                className="min-w-11 min-h-11"
                style={closePressed ? pressedActionButtonStyle : undefined}
              >
                <ButtonIcon as={CloseIcon} size="lg" color={topActionIconStyle.color} />
              </Button>
            </HStack>
          </HStack>

          {error ? (
            <Box className="mx-5 mt-2 gap-2 rounded-xl border p-4" style={errorBannerStyle}>
              <Text size="sm" className="text-error-600">
                {error}
              </Text>
            </Box>
          ) : null}

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: spacing["5"],
              paddingTop: spacing["4"],
              paddingBottom: spacing["6"],
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={theme.colors.accent}
              />
            }
          >
            <Box className="rounded-2xl border p-4 mb-4" style={heroCardStyle}>
              <HStack className="items-center justify-between">
                <Box className="flex-1 min-w-0 pr-4">
                  <Text size="sm" bold style={textPrimaryStyle}>
                    Exposed Ports
                  </Text>
                  <Text size="xs" className="mt-1" style={textSecondaryStyle}>
                    Ports accessible through the Cloudflare tunnel. Add ports for services
                    running on your machine (e.g. Vite on 5173, Express on 8080).
                  </Text>
                </Box>
                <Box className="rounded-lg border px-3 py-2" style={statPillStyle}>
                  <Text size="xs" style={textSecondaryStyle}>
                    Ports
                  </Text>
                  <Text size="sm" bold style={{ color: theme.colors.accent }}>
                    {ports.length}
                  </Text>
                </Box>
              </HStack>
            </Box>

            {builtinPorts.length > 0 && (
              <ListSectionCard
                title="System ports"
                subtitle="Always exposed — cannot be removed"
                className="mb-4"
                style={sectionCardStyle}
              >
                <VStack className="gap-2">
                  {builtinPorts.map((entry) => (
                    <PortRow
                      key={entry.port}
                      entry={entry}
                      theme={theme}
                      removable={false}
                    />
                  ))}
                </VStack>
              </ListSectionCard>
            )}

            {userPorts.length > 0 && (
              <ListSectionCard
                title="Custom ports"
                subtitle="User-configured port exposure"
                className="mb-4"
                style={sectionCardStyle}
              >
                <VStack className="gap-2">
                  {userPorts.map((entry) => (
                    <PortRow
                      key={entry.port}
                      entry={entry}
                      theme={theme}
                      removable
                      onRemove={() => handleRemovePort(entry.port)}
                    />
                  ))}
                </VStack>
              </ListSectionCard>
            )}

            <ListSectionCard
              title="Add port"
              subtitle="Expose a new local port through the tunnel"
              className="mb-4"
              style={sectionCardStyle}
            >
              <VStack className="gap-3">
                <HStack className="gap-3 items-end">
                  <VStack className="flex-1 gap-1">
                    <Text size="xs" style={textSecondaryStyle}>
                      Port
                    </Text>
                    <TextInput
                      value={newPort}
                      onChangeText={setNewPort}
                      placeholder="8080"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      maxLength={5}
                      style={inputStyle}
                    />
                  </VStack>
                  <VStack className="flex-2 gap-1">
                    <Text size="xs" style={textSecondaryStyle}>
                      Label (optional)
                    </Text>
                    <TextInput
                      value={newLabel}
                      onChangeText={setNewLabel}
                      placeholder="Web Preview"
                      placeholderTextColor={theme.colors.textMuted}
                      returnKeyType="done"
                      maxLength={40}
                      style={inputStyle}
                      onSubmitEditing={handleAddPort}
                    />
                  </VStack>
                </HStack>
                <Button
                  action="primary"
                  variant="outline"
                  size="sm"
                  onPress={handleAddPort}
                  isDisabled={!newPort.trim()}
                  className="rounded-xl border self-end"
                  style={{
                    borderColor: theme.colors.accent,
                    backgroundColor: `${theme.colors.accent}14`,
                  }}
                >
                  <ButtonIcon as={AttachPlusIcon} size="sm" color={theme.colors.accent} />
                  <ButtonText style={{ color: theme.colors.accent, marginLeft: 4 }}>
                    Add Port
                  </ButtonText>
                </Button>
              </VStack>
            </ListSectionCard>

            <Button
              action="positive"
              variant="solid"
              size="lg"
              onPress={handleApply}
              isDisabled={applying || loading}
              className="rounded-xl mb-4"
              style={{
                backgroundColor: theme.colors.success,
                opacity: applying ? 0.7 : 1,
              }}
            >
              <ButtonText style={{ color: "#fff", fontWeight: "700" }}>
                {applying ? "Applying…" : "Apply & Reload Proxy"}
              </ButtonText>
            </Button>

            <Text size="xs" className="text-center mb-6" style={textSecondaryStyle}>
              Applying will reload the proxy whitelist. The connection may briefly
              disconnect and automatically reconnect.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Box>
    </ModalScaffold>
  );
}

function PortRow({
  entry,
  theme,
  removable,
  onRemove,
}: {
  entry: ExposedPort;
  theme: ReturnType<typeof useTheme>;
  removable: boolean;
  onRemove?: () => void;
}) {
  return (
    <HStack
      className="items-center justify-between rounded-xl px-4 py-3 border"
      style={{
        borderColor: `${theme.colors.accent}20`,
        backgroundColor: `${theme.colors.accent}08`,
      }}
    >
      <HStack className="items-center gap-3 flex-1 min-w-0">
        <Box
          className="h-8 w-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${theme.colors.info}20` }}
        >
          <Text size="xs" bold style={{ color: theme.colors.info }}>
            {entry.port}
          </Text>
        </Box>
        <VStack className="flex-1 min-w-0">
          <Text
            size="sm"
            bold
            numberOfLines={1}
            style={{ color: theme.colors.textPrimary }}
          >
            {entry.label}
          </Text>
          <Text size="xs" style={{ color: theme.colors.textMuted }}>
            localhost:{entry.port}
          </Text>
        </VStack>
      </HStack>
      {removable && onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Remove port ${entry.port}`}
          className="ml-2 p-2 rounded-lg"
          style={({ pressed }) => [
            {
              backgroundColor: pressed
                ? `${theme.colors.danger}20`
                : "transparent",
            },
          ]}
        >
          <TrashIcon size={16} color={theme.colors.danger} />
        </Pressable>
      ) : (
        <Box
          className="px-2 py-1 rounded-md"
          style={{ backgroundColor: `${theme.colors.accent}14` }}
        >
          <Text size="xs" style={{ color: theme.colors.textMuted }}>
            built-in
          </Text>
        </Box>
      )}
    </HStack>
  );
}
