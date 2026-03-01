export type DockerTab = "containers" | "images" | "volumes";

export interface DockerContainer {
  id: string;
  names: string[];
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
}
