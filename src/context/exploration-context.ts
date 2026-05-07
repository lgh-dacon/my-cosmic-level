import { createContext } from "react";
import type { ExplorationStats, PhotoRecord } from "@/lib/exploration";

export interface ExplorationCtxValue {
  photos: PhotoRecord[];
  pending: PhotoRecord[];
  stats: ExplorationStats;
  isReady: boolean;
  addFiles: (files: FileList | File[]) => Promise<PhotoRecord[]>;
  stageFiles: (files: FileList | File[]) => Promise<PhotoRecord[]>;
  commitPending: () => Promise<PhotoRecord[]>;
  removePending: (id: string) => void;
  clearPending: () => void;
  removePhoto: (id: string) => void;
  updatePhoto: (id: string, patch: Partial<PhotoRecord>) => void;
  clear: () => void;
}

export const ExplorationCtx = createContext<ExplorationCtxValue | null>(null);
