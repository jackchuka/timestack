// tests/editor-tree.test.ts
import { describe, it, expect } from "vitest";
import {
  createEditorNode,
  addChild,
  addSibling,
  deleteNode,
  computeDuration,
  validateNode,
  countDescendants,
  findParent,
} from "../src/ui/editor-tree";
import type { ConfigNode } from "../src/types";

describe("createEditorNode", () => {
  it("creates a leaf node with defaults", () => {
    const node = createEditorNode();
    expect(node.name).toBe("Segment");
    expect(node.duration).toBe("1m");
    expect(node.children).toBeUndefined();
  });
});

describe("addChild", () => {
  it("converts leaf to parent with one new child", () => {
    const leaf: ConfigNode = { name: "A", duration: "2m", mode: "soft", color: "#ff0000" };
    addChild(leaf);
    expect(leaf.children).toHaveLength(1);
    expect(leaf.children![0].name).toBe("Segment");
    expect(leaf.children![0].duration).toBe("1m");
    expect(leaf.duration).toBeUndefined();
    expect(leaf.mode).toBe("soft");
    expect(leaf.color).toBe("#ff0000");
  });

  it("adds child to existing parent", () => {
    const parent: ConfigNode = { name: "P", children: [{ name: "A", duration: "1m" }] };
    addChild(parent);
    expect(parent.children).toHaveLength(2);
    expect(parent.children![1].name).toBe("Segment");
  });
});

describe("addSibling", () => {
  it("adds sibling after the given index", () => {
    const parent: ConfigNode = {
      name: "P",
      children: [
        { name: "A", duration: "1m" },
        { name: "B", duration: "2m" },
      ],
    };
    addSibling(parent, 0);
    expect(parent.children).toHaveLength(3);
    expect(parent.children![1].name).toBe("Segment");
    expect(parent.children![2].name).toBe("B");
  });
});

describe("deleteNode", () => {
  it("removes node at index", () => {
    const parent: ConfigNode = {
      name: "P",
      children: [
        { name: "A", duration: "1m" },
        { name: "B", duration: "2m" },
      ],
    };
    deleteNode(parent, 1);
    expect(parent.children).toHaveLength(1);
    expect(parent.children![0].name).toBe("A");
  });

  it("converts parent to leaf when last child deleted", () => {
    const parent: ConfigNode = { name: "P", children: [{ name: "A", duration: "1m" }] };
    deleteNode(parent, 0);
    expect(parent.children).toBeUndefined();
    expect(parent.duration).toBe("1m");
  });
});

describe("computeDuration", () => {
  it("returns formatted duration for leaf", () => {
    expect(computeDuration({ name: "A", duration: "2m" })).toBe("2:00");
  });

  it("returns sum for parent", () => {
    const parent: ConfigNode = {
      name: "P",
      children: [
        { name: "A", duration: "1m" },
        { name: "B", duration: "2m30s" },
      ],
    };
    expect(computeDuration(parent)).toBe("3:30");
  });
});

describe("validateNode", () => {
  it("returns empty array for valid leaf", () => {
    expect(validateNode({ name: "A", duration: "1m" })).toEqual([]);
  });
  it("returns error for empty name", () => {
    const errors = validateNode({ name: "", duration: "1m" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("name");
  });
  it("returns error for invalid duration", () => {
    const errors = validateNode({ name: "A", duration: "bad" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("duration");
  });
  it("returns error for empty children", () => {
    const errors = validateNode({ name: "A", children: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("child");
  });
});

describe("countDescendants", () => {
  it("returns 0 for leaf", () => {
    expect(countDescendants({ name: "A", duration: "1m" })).toBe(0);
  });
  it("counts nested children", () => {
    const node: ConfigNode = {
      name: "R",
      children: [
        { name: "A", children: [{ name: "B", duration: "1m" }] },
        { name: "C", duration: "2m" },
      ],
    };
    expect(countDescendants(node)).toBe(3);
  });
});

describe("findParent", () => {
  it("returns parent of target node", () => {
    const child: ConfigNode = { name: "A", duration: "1m" };
    const root: ConfigNode = { name: "R", children: [child] };
    expect(findParent(child, root)).toBe(root);
  });
  it("returns null for root", () => {
    const root: ConfigNode = { name: "R", children: [{ name: "A", duration: "1m" }] };
    expect(findParent(root, root)).toBeNull();
  });
});
