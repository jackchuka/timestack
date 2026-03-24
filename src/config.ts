import type { ConfigFile, ConfigNode, GlobalConfig, TreeNode, FlatSegment } from "./types";

// ─── Part 1: Duration Parser ──────────────────────────────────────────────────

const DURATION_RE = /^(?:(\d+(?:\.\d+)?)m)?(?:(\d+)s)?$/;

export function parseDuration(raw: string): number {
  if (!raw) throw new Error("Invalid duration: empty string");
  const match = raw.match(DURATION_RE);
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Invalid duration: "${raw}". Use "Nm", "Ns", or "NmNs".`);
  }
  const minutes = match[1] ? parseFloat(match[1]) : 0;
  const seconds = match[2] ? parseInt(match[2], 10) : 0;
  const totalMs = (minutes * 60 + seconds) * 1000;
  if (totalMs <= 0) throw new Error(`Duration must be > 0, got "${raw}"`);
  return totalMs;
}

// ─── Part 2: Config Validator ─────────────────────────────────────────────────

export function validateConfig(config: ConfigFile): void {
  if (config.version !== 1) throw new Error(`Config version must be 1, got ${config.version}`);
  if (!config.title) throw new Error("Config must have a title");
  if (!config.config) throw new Error("Config must have a config section");
  validateNode(config.root);
}

function validateNode(node: ConfigNode, path = "root"): void {
  if (!node.name) throw new Error(`Node at ${path} is missing a name`);
  if (node.mode && node.mode !== "hard" && node.mode !== "soft") {
    throw new Error(
      `Node "${node.name}" has invalid mode "${node.mode}". Must be "hard" or "soft".`,
    );
  }
  if (node.children !== undefined) {
    if (node.children.length === 0) {
      throw new Error(
        `Node "${node.name}" has empty children array. Use a leaf with duration instead.`,
      );
    }
    node.children.forEach((child, i) => validateNode(child, `${path}.children[${i}]`));
  } else {
    if (!node.duration)
      throw new Error(`Leaf node "${node.name}" at ${path} is missing a duration.`);
    parseDuration(node.duration);
  }
}

// ─── Part 3: Tree Resolution & Flattening ─────────────────────────────────────

const DEFAULT_COLOR = "#3498db";

interface ResolveOptions {
  parentMode?: string;
  parentColor?: string;
  parentWarningAt?: number;
  depth?: number;
  idPrefix?: string;
}

export function resolveTree(
  node: ConfigNode,
  globals: GlobalConfig,
  opts: ResolveOptions = {},
): TreeNode {
  const { parentMode, parentColor, parentWarningAt, depth = 0, idPrefix = "0" } = opts;
  const mode = (node.mode ?? parentMode ?? globals.defaultMode) as TreeNode["mode"];
  const color = node.color ?? parentColor ?? DEFAULT_COLOR;
  const warningAtMs = (node.warningAt ?? parentWarningAt ?? globals.warningAt) * 1000;

  if (node.children && node.children.length > 0) {
    const children = node.children.map((child, i) =>
      resolveTree(child, globals, {
        parentMode: mode,
        parentColor: color,
        parentWarningAt: warningAtMs / 1000,
        depth: depth + 1,
        idPrefix: `${idPrefix}.${i}`,
      }),
    );
    const treeNode: TreeNode = {
      id: idPrefix,
      name: node.name,
      children,
      durationMs: children.reduce((sum, c) => sum + c.durationMs, 0),
      mode,
      color,
      warningAtMs,
      isLeaf: false,
      depth,
      parent: null,
    };
    children.forEach((c) => (c.parent = treeNode));
    return treeNode;
  }

  return {
    id: idPrefix,
    name: node.name,
    children: [],
    durationMs: parseDuration(node.duration!),
    mode,
    color,
    warningAtMs,
    isLeaf: true,
    depth,
    parent: null,
  };
}

export function flattenLeaves(root: TreeNode): FlatSegment[] {
  const result: FlatSegment[] = [];
  function walk(node: TreeNode): void {
    if (node.isLeaf) {
      result.push({ index: result.length, node });
    } else {
      node.children.forEach(walk);
    }
  }
  walk(root);
  return result;
}
