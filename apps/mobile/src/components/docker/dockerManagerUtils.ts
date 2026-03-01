import type { DockerContainer, DockerImage, DockerVolume } from "@/components/docker/dockerManagerModels";

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function areDockerContainersEqual(a: DockerContainer[], b: DockerContainer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.id === next.id &&
      areStringArraysEqual(item.names, next.names) &&
      item.image === next.image &&
      item.status === next.status &&
      item.state === next.state &&
      item.ports === next.ports &&
      item.created === next.created
    );
  });
}

export function areDockerImagesEqual(a: DockerImage[], b: DockerImage[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.id === next.id &&
      areStringArraysEqual(item.repoTags, next.repoTags) &&
      item.size === next.size &&
      item.created === next.created
    );
  });
}

export function areDockerVolumesEqual(a: DockerVolume[], b: DockerVolume[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.name === next.name &&
      item.driver === next.driver &&
      item.mountpoint === next.mountpoint &&
      item.created === next.created
    );
  });
}

export function statusClass(state: string): "running" | "exited" | "paused" | "unknown" {
  const s = (state || "").toLowerCase();
  if (s.includes("running")) return "running";
  if (s.includes("exited") || s.includes("dead")) return "exited";
  if (s.includes("paused")) return "paused";
  return "unknown";
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
