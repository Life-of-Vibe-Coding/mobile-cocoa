import type { LoadedSession } from "@/components/chat/SessionManagementModal";

export type ChatModalOpenHandlers = {
  onOpenSessionManagement: () => void;
  onCloseSessionManagement: () => void;
  onOpenSkillsConfig: () => void;
  onOpenProcesses: () => void;
  onOpenDocker: () => void;
  onOpenPortForwarding: () => void;
  onOpenModelPicker: () => void;
  onOpenGeneralSettings: () => void;
  isSessionManagementOpen: boolean;
  isAnyModalOpen: boolean;
  /** True when any modal OTHER than session management is open */
  isAnyNonSessionModalOpen: boolean;
  /** Session management specific handlers for swipe navigation */
  onOpenWorkspacePickerFromSession: () => void;
  onSessionSelect: (session: LoadedSession) => void;
  onNewSession: () => void;
  onSelectActiveChat: () => void;
};

