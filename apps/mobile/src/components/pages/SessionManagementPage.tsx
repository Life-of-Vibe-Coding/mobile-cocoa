import { SessionManagementModal, type SessionManagementModalProps } from "@/components/chat/SessionManagementModal";
import { Box } from "@/components/ui/box";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";

type SessionManagementPageProps = Omit<SessionManagementModalProps, "embedded">;

export function SessionManagementPage({
  isOpen,
  ...props
}: SessionManagementPageProps) {
  // Always render the full page since it's mounted inside the
  // SwipeablePageNavigator and needs to be visible during swipe gestures.
  // The SessionManagementModal handles isOpen internally for data fetching.
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left", "right"]}>
      <Box className="flex-1 bg-surface-base">
        <SessionManagementModal isOpen={isOpen} embedded {...props} />
      </Box>
    </SafeAreaView>
  );
}

