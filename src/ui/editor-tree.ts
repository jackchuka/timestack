// src/ui/editor-tree.ts
import type { ConfigNode } from "../types";
import { parseDuration } from "../config";
import { formatTime } from "./display";

export const MAX_DEPTH = 6;

export function createEditorNode(): ConfigNode {
  return { name: "Segment", duration: "1m" };
}

export function addChild(node: ConfigNode, currentDepth = 0): void {
  if (currentDepth >= MAX_DEPTH) return;
  if (!node.children) {
    delete node.duration;
    node.children = [createEditorNode()];
  } else {
    node.children.push(createEditorNode());
  }
}

export function addSibling(parent: ConfigNode, afterIndex: number): void {
  if (!parent.children) return;
  parent.children.splice(afterIndex + 1, 0, createEditorNode());
}

export function deleteNode(parent: ConfigNode, index: number): void {
  if (!parent.children) return;
  parent.children.splice(index, 1);
  if (parent.children.length === 0) {
    delete parent.children;
    parent.duration = "1m";
  }
}

export function computeDuration(node: ConfigNode): string {
  if (node.children) {
    let totalMs = 0;
    for (const child of node.children) {
      totalMs += computeDurationMs(child);
    }
    return formatTime(totalMs, false);
  }
  try {
    return formatTime(parseDuration(node.duration || "0s"), false);
  } catch {
    return "—";
  }
}

function computeDurationMs(node: ConfigNode): number {
  if (node.children) {
    return node.children.reduce((sum, c) => sum + computeDurationMs(c), 0);
  }
  try {
    return parseDuration(node.duration || "0s");
  } catch {
    return 0;
  }
}

export function validateNode(node: ConfigNode): string[] {
  const errors: string[] = [];
  if (!node.name || node.name.trim() === "") errors.push("Node name is required");
  if (node.children) {
    if (node.children.length === 0) errors.push("Parent must have at least one child");
  } else {
    if (!node.duration) {
      errors.push("Leaf node requires a duration");
    } else {
      try {
        parseDuration(node.duration);
      } catch {
        errors.push("Invalid duration format. Use 1m30s, 3m, or 90s");
      }
    }
  }
  return errors;
}

export function countDescendants(node: ConfigNode): number {
  if (!node.children) return 0;
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

export function findParent(target: ConfigNode, root: ConfigNode): ConfigNode | null {
  if (root.children) {
    for (const child of root.children) {
      if (child === target) return root;
      const found = findParent(target, child);
      if (found) return found;
    }
  }
  return null;
}

export function getDepth(node: ConfigNode, root: ConfigNode): number {
  function find(current: ConfigNode, depth: number): number {
    if (current === node) return depth;
    if (current.children) {
      for (const child of current.children) {
        const d = find(child, depth + 1);
        if (d >= 0) return d;
      }
    }
    return -1;
  }
  return find(root, 0);
}
