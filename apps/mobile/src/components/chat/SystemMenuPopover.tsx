import { AttachPlusIcon, ChevronDownIcon, ChevronUpIcon, DockerIcon, GlobeIcon, PortForwardIcon, SettingsIcon, TerminalIcon } from "@/components/icons/ChatActionIcons";
import { Popover, PopoverBackdrop, PopoverContent } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Box } from "@/components/ui/box";
import { ScaleWrapper } from "@/components/reusable/ScaleWrapper";
import { triggerHaptic } from "@/designSystem";
import { BlurView } from "expo-blur";
import React from "react";
import { View as RNView, Platform } from "react-native";

interface SystemMenuPopoverProps {
    isDark: boolean;
    theme: any;
    terminalMenuVisible: boolean;
    setTerminalMenuVisible: (visible: boolean) => void;
    onOpenProcesses?: () => void;
    onOpenDocker?: () => void;
    onOpenWebPreview?: () => void;
    isCloudflareMode?: boolean;
    onOpenPortForwarding?: () => void;
    isAutoApproveToolConfirm: boolean;
    onAutoApproveToolConfirmChange: (next: boolean) => void;
    onOpenGeneralSettings?: () => void;
}

export function SystemMenuPopover({
    isDark,
    theme,
    terminalMenuVisible,
    setTerminalMenuVisible,
    onOpenProcesses,
    onOpenDocker,
    onOpenWebPreview,
    isCloudflareMode,
    onOpenPortForwarding,
    isAutoApproveToolConfirm,
    onAutoApproveToolConfirmChange,
    onOpenGeneralSettings,
}: SystemMenuPopoverProps) {
    return (
        <Popover
            isOpen={terminalMenuVisible}
            onClose={() => setTerminalMenuVisible(false)}
            onOpen={() => setTerminalMenuVisible(true)}
            placement="top right"
            offset={12}
            trigger={(triggerProps) => (
                <ScaleWrapper>
                    <Pressable
                        {...triggerProps}
                        onPress={(e) => {
                            triggerHaptic("selection");
                            setTerminalMenuVisible(!terminalMenuVisible);
                            if (triggerProps.onPress) { triggerProps.onPress(e); }
                        }}
                        accessibilityLabel="System menu"
                        className="flex-row items-center justify-center gap-1.5 px-3 rounded-full h-11 min-w-11 active:opacity-90 transition-all"
                        style={{
                            backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.05)",
                            borderColor: isDark ? "rgba(56, 189, 248, 0.4)" : "rgba(15, 23, 42, 0.12)",
                            borderWidth: 1.5,
                        }}
                    >
                        <AttachPlusIcon size={20} color={isDark ? theme.colors.info : theme.colors.textPrimary} />
                        <ChevronUpIcon
                            size={12}
                            color={isDark ? theme.colors.info : theme.colors.textPrimary}
                            style={{
                                transform: [{ rotate: terminalMenuVisible ? '0deg' : '180deg' }],
                                opacity: 0.7
                            }}
                        />
                    </Pressable>
                </ScaleWrapper>
            )}
        >
            <PopoverBackdrop
                style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
                onPress={() => setTerminalMenuVisible(false)}
            />
            <PopoverContent
                style={{
                    backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "rgba(255, 255, 255, 0.85)",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
                    borderWidth: 1.5,
                    borderRadius: 28,
                    padding: 4,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: isDark ? 0.6 : 0.2,
                    shadowRadius: 40,
                    elevation: 15,
                    overflow: "hidden",
                    width: 240,
                }}
            >
                <BlurView
                    intensity={isDark ? 50 : 70}
                    tint={isDark ? "dark" : "light"}
                    style={{ padding: 12 }}
                >
                    <VStack space="md">
                        <HStack className="items-center justify-center gap-3">
                            {onOpenProcesses && (
                                <Box className="items-center gap-1.5">
                                    <Pressable
                                        onPress={() => {
                                            triggerHaptic("selection");
                                            setTerminalMenuVisible(false);
                                            onOpenProcesses();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Open Terminal"
                                        className="w-14 h-14 rounded-2xl items-center justify-center active:scale-90 transition-transform"
                                        style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)" }}
                                    >
                                        <TerminalIcon size={24} color={isDark ? "#E0E7FF" : "#4F46E5"} />
                                    </Pressable>
                                    <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Process</Text>
                                </Box>
                            )}
                            {onOpenDocker && (
                                <Box className="items-center gap-1.5">
                                    <Pressable
                                        onPress={() => {
                                            triggerHaptic("selection");
                                            setTerminalMenuVisible(false);
                                            onOpenDocker();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Open Docker"
                                        className="w-14 h-14 rounded-2xl items-center justify-center active:scale-90 transition-transform"
                                        style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)" }}
                                    >
                                        <DockerIcon size={24} color={isDark ? "#38BDF8" : "#0EA5E9"} />
                                    </Pressable>
                                    <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Docker</Text>
                                </Box>
                            )}
                            {onOpenWebPreview && (
                                <Box className="items-center gap-1.5">
                                    <Pressable
                                        onPress={() => {
                                            triggerHaptic("selection");
                                            setTerminalMenuVisible(false);
                                            onOpenWebPreview();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Open Browser"
                                        className="w-14 h-14 rounded-2xl items-center justify-center active:scale-90 transition-transform"
                                        style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)" }}
                                    >
                                        <GlobeIcon size={24} color={isDark ? "#34D399" : "#10B981"} />
                                    </Pressable>
                                    <Text size="xs" style={{ color: theme.colors.textPrimary, fontWeight: "600", fontSize: 10 }}>Browser</Text>
                                </Box>
                            )}
                        </HStack>

                        <Box className="h-px w-full bg-black/10 dark:bg-white/10 my-1" />

                        <HStack className="items-center justify-between px-2 py-1">
                            <VStack space="xs">
                                <Text size="sm" bold={true} style={{ color: theme.colors.textPrimary }}>YOLO Mode</Text>
                                <Text size="xs" style={{ color: theme.colors.textMuted, fontSize: 10 }}>Skip tool confirmations</Text>
                            </VStack>
                            <Switch
                                value={isAutoApproveToolConfirm}
                                onValueChange={(val) => {
                                    triggerHaptic("light");
                                    onAutoApproveToolConfirmChange(val);
                                }}
                                accessibilityLabel="Toggle YOLO mode"
                                trackColor={{
                                    false: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                    true: isDark ? theme.colors.info : "#0EA5E9",
                                }}
                                thumbColor={isAutoApproveToolConfirm ? "#FFFFFF" : isDark ? "#A1A1AA" : "#F4F4F5"}
                                style={{ transform: [{ scale: 0.85 }] }}
                            />
                        </HStack>

                        {isCloudflareMode && onOpenPortForwarding && (
                            <Pressable
                                onPress={() => {
                                    triggerHaptic("selection");
                                    setTerminalMenuVisible(false);
                                    onOpenPortForwarding();
                                }}
                                className="flex-row items-center gap-3 px-2 py-2 rounded-xl active:bg-black/5"
                            >
                                <Box className="w-8 h-8 rounded-lg items-center justify-center bg-success-500/10">
                                    <PortForwardIcon size={18} color={theme.colors.success} />
                                </Box>
                                <Text size="sm" style={{ color: theme.colors.textPrimary, fontWeight: "500" }}>Port Forwarding</Text>
                            </Pressable>
                        )}

                        <Box className="h-px w-full bg-black/10 dark:bg-white/10 my-1" />

                        <Pressable
                            onPress={() => {
                                triggerHaptic("selection");
                                setTerminalMenuVisible(false);
                                onOpenGeneralSettings?.();
                            }}
                            className="flex-row items-center gap-3 px-2 py-2 rounded-xl active:bg-black/5"
                        >
                            <Box className="w-8 h-8 rounded-lg items-center justify-center bg-background-500/10">
                                <SettingsIcon size={18} color={theme.colors.textPrimary} />
                            </Box>
                            <Text size="sm" style={{ color: theme.colors.textPrimary, fontWeight: "500" }}>General Settings</Text>
                        </Pressable>
                    </VStack>
                </BlurView>
            </PopoverContent>
        </Popover>
    );
}
