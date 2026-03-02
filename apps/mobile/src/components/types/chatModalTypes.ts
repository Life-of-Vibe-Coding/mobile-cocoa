export type ChatModalOpenHandlers = {
  onOpenSessionManagement: () => void;
  onOpenSkillsConfig: () => void;
  onOpenProcesses: () => void;
  onOpenDocker: () => void;
  onOpenPortForwarding: () => void;
  onOpenModelPicker: () => void;
  isSessionManagementOpen: boolean;
  isAnyModalOpen: boolean;
};
