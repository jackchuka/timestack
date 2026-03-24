import { describe, it, expect } from "vitest";
import { parseDuration, validateConfig, resolveTree, flattenLeaves } from "../src/config";
import type { ConfigFile, ConfigNode, GlobalConfig } from "../src/types";

// ─── Part 1: parseDuration ────────────────────────────────────────────────────

describe("parseDuration", () => {
  it("parses minutes", () => {
    expect(parseDuration("3m")).toBe(180_000);
  });
  it("parses decimal minutes", () => {
    expect(parseDuration("1.5m")).toBe(90_000);
  });
  it("parses seconds", () => {
    expect(parseDuration("90s")).toBe(90_000);
  });
  it("parses combined minutes and seconds", () => {
    expect(parseDuration("1m30s")).toBe(90_000);
  });
  it("throws on bare number", () => {
    expect(() => parseDuration("90")).toThrow("Invalid duration");
  });
  it("throws on empty string", () => {
    expect(() => parseDuration("")).toThrow("Invalid duration");
  });
  it("throws on zero duration", () => {
    expect(() => parseDuration("0m")).toThrow("must be > 0");
  });
  it("throws on negative duration", () => {
    expect(() => parseDuration("-1m")).toThrow("Invalid duration");
  });
});

// ─── Part 2: validateConfig ───────────────────────────────────────────────────

const makeLeaf = (overrides: Partial<ConfigNode> = {}): ConfigNode => ({
  name: "Task",
  duration: "5m",
  ...overrides,
});

const makeValidConfig = (rootOverrides: Partial<ConfigNode> = {}): ConfigFile => ({
  version: 1,
  title: "Test Meeting",
  config: { defaultMode: "hard", warningAt: 60 },
  root: makeLeaf(rootOverrides),
});

describe("validateConfig", () => {
  it("accepts a valid leaf config", () => {
    expect(() => validateConfig(makeValidConfig())).not.toThrow();
  });

  it("accepts a valid tree config", () => {
    const config: ConfigFile = {
      version: 1,
      title: "Test",
      config: { defaultMode: "hard", warningAt: 60 },
      root: {
        name: "Root",
        children: [
          { name: "Child A", duration: "3m" },
          { name: "Child B", duration: "2m" },
        ],
      },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("throws on wrong version", () => {
    const config = makeValidConfig();
    (config as any).version = 2;
    expect(() => validateConfig(config)).toThrow("version must be 1");
  });

  it("throws on missing title", () => {
    const config = makeValidConfig();
    (config as any).title = "";
    expect(() => validateConfig(config)).toThrow("title");
  });

  it("throws on missing config section", () => {
    const config = makeValidConfig();
    (config as any).config = undefined;
    expect(() => validateConfig(config)).toThrow("config section");
  });

  it("throws when leaf is missing duration", () => {
    expect(() => validateConfig(makeValidConfig({ name: "Task", duration: undefined }))).toThrow(
      "missing a duration",
    );
  });

  it("throws when leaf has invalid duration", () => {
    expect(() => validateConfig(makeValidConfig({ duration: "abc" }))).toThrow("Invalid duration");
  });

  it("throws on empty children array", () => {
    expect(() =>
      validateConfig(makeValidConfig({ name: "Parent", children: [], duration: undefined })),
    ).toThrow("empty children array");
  });

  it("throws on missing node name", () => {
    expect(() => validateConfig(makeValidConfig({ name: "" }))).toThrow("missing a name");
  });

  it("throws on invalid mode", () => {
    expect(() => validateConfig(makeValidConfig({ mode: "invalid" as any }))).toThrow(
      "invalid mode",
    );
  });
});

// ─── Part 3: resolveTree & flattenLeaves ──────────────────────────────────────

const globals: GlobalConfig = {
  defaultMode: "hard",
  warningAt: 60,
};

describe("resolveTree", () => {
  it("resolves a leaf node duration from string", () => {
    const node: ConfigNode = { name: "Task", duration: "3m" };
    const tree = resolveTree(node, globals);
    expect(tree.durationMs).toBe(180_000);
    expect(tree.isLeaf).toBe(true);
  });

  it("uses global defaultMode when no mode specified", () => {
    const node: ConfigNode = { name: "Task", duration: "1m" };
    const tree = resolveTree(node, globals);
    expect(tree.mode).toBe("hard");
  });

  it("node mode overrides global", () => {
    const node: ConfigNode = { name: "Task", duration: "1m", mode: "soft" };
    const tree = resolveTree(node, globals);
    expect(tree.mode).toBe("soft");
  });

  it("child inherits parent mode", () => {
    const node: ConfigNode = {
      name: "Parent",
      mode: "soft",
      children: [{ name: "Child", duration: "1m" }],
    };
    const tree = resolveTree(node, globals);
    expect(tree.children[0].mode).toBe("soft");
  });

  it("child mode overrides parent mode", () => {
    const node: ConfigNode = {
      name: "Parent",
      mode: "soft",
      children: [{ name: "Child", duration: "1m", mode: "hard" }],
    };
    const tree = resolveTree(node, globals);
    expect(tree.children[0].mode).toBe("hard");
  });

  it("defaults color to #3498db when not specified", () => {
    const node: ConfigNode = { name: "Task", duration: "1m" };
    const tree = resolveTree(node, globals);
    expect(tree.color).toBe("#3498db");
  });

  it("uses node color when specified", () => {
    const node: ConfigNode = { name: "Task", duration: "1m", color: "#ff0000" };
    const tree = resolveTree(node, globals);
    expect(tree.color).toBe("#ff0000");
  });

  it("child inherits parent color", () => {
    const node: ConfigNode = {
      name: "Parent",
      color: "#abcdef",
      children: [{ name: "Child", duration: "1m" }],
    };
    const tree = resolveTree(node, globals);
    expect(tree.children[0].color).toBe("#abcdef");
  });

  it("warningAt resolved from globals in ms", () => {
    const node: ConfigNode = { name: "Task", duration: "1m" };
    const tree = resolveTree(node, globals);
    expect(tree.warningAtMs).toBe(60_000);
  });

  it("per-segment warningAt overrides globals", () => {
    const node: ConfigNode = { name: "Task", duration: "1m", warningAt: 30 };
    const tree = resolveTree(node, globals);
    expect(tree.warningAtMs).toBe(30_000);
  });

  it("parent duration equals sum of children", () => {
    const node: ConfigNode = {
      name: "Parent",
      children: [
        { name: "A", duration: "2m" },
        { name: "B", duration: "1m30s" },
      ],
    };
    const tree = resolveTree(node, globals);
    expect(tree.durationMs).toBe(210_000);
    expect(tree.isLeaf).toBe(false);
  });

  it("sets correct depth and id", () => {
    const node: ConfigNode = {
      name: "Root",
      children: [{ name: "Child", duration: "1m" }],
    };
    const tree = resolveTree(node, globals);
    expect(tree.depth).toBe(0);
    expect(tree.children[0].depth).toBe(1);
    expect(tree.id).toBe("0");
    expect(tree.children[0].id).toBe("0.0");
  });

  it("sets parent reference on children", () => {
    const node: ConfigNode = {
      name: "Root",
      children: [{ name: "Child", duration: "1m" }],
    };
    const tree = resolveTree(node, globals);
    expect(tree.children[0].parent).toBe(tree);
  });
});

describe("flattenLeaves", () => {
  it("returns single leaf for a leaf-only tree", () => {
    const node: ConfigNode = { name: "Task", duration: "3m" };
    const tree = resolveTree(node, globals);
    const flat = flattenLeaves(tree);
    expect(flat).toHaveLength(1);
    expect(flat[0].index).toBe(0);
    expect(flat[0].node.name).toBe("Task");
  });

  it("returns DFS-ordered leaves", () => {
    const node: ConfigNode = {
      name: "Root",
      children: [
        {
          name: "Group A",
          children: [
            { name: "A1", duration: "1m" },
            { name: "A2", duration: "2m" },
          ],
        },
        { name: "B", duration: "3m" },
      ],
    };
    const tree = resolveTree(node, globals);
    const flat = flattenLeaves(tree);
    expect(flat.map((s) => s.node.name)).toEqual(["A1", "A2", "B"]);
    expect(flat.map((s) => s.index)).toEqual([0, 1, 2]);
  });
});
