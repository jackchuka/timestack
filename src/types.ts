// Config types (what the user writes in JSON)
export interface ConfigFile {
  version: number;
  title: string;
  config: GlobalConfig;
  root: ConfigNode;
}

export interface GlobalConfig {
  defaultMode: SegmentMode;
  warningAt: number; // seconds
}

export interface ConfigNode {
  name: string;
  children?: ConfigNode[];
  duration?: string; // "3m", "90s", "1m30s"
  mode?: SegmentMode;
  color?: string;
  warningAt?: number; // per-segment override, seconds
}

export type SegmentMode = "hard" | "soft";

// Resolved types (after parsing + inheritance)
export interface TreeNode {
  id: string; // unique path-based id, e.g., "0.1.2"
  name: string;
  children: TreeNode[];
  durationMs: number; // resolved: own or sum of children
  mode: SegmentMode; // resolved via inheritance
  color: string; // resolved via inheritance
  warningAtMs: number; // resolved via inheritance
  isLeaf: boolean;
  depth: number;
  parent: TreeNode | null;
}

// Flat segment for the timer engine (leaf nodes only)
export interface FlatSegment {
  index: number;
  node: TreeNode; // reference to the tree node
}

export type SegmentState = "pending" | "running" | "warning" | "overtime" | "paused" | "done";

// The state that was active before pausing (for resume)
export type PausedFrom = "running" | "warning" | "overtime";
