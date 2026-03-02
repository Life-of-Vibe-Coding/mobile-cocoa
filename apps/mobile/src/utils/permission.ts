
export type PermissionModeUI = "yolo";

export type BackendPermissionResult = {
  approvalMode: "auto_edit";
};

/**
 * Returns the backend permission config (always yolo/auto_edit).
 */
export function getBackendPermissionMode(): BackendPermissionResult {
  return { approvalMode: "auto_edit" };
}
