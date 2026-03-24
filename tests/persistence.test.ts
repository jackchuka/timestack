// tests/persistence.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, saveConfig } from "../src/persistence";
import type { ConfigFile } from "../src/types";

const validConfig: ConfigFile = {
  version: 1,
  title: "Test",
  config: { defaultMode: "hard", warningAt: 10 },
  root: { name: "Root", children: [{ name: "A", duration: "1m" }] },
};

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("saveConfig / loadConfig", () => {
    it("saves and loads config from localStorage", () => {
      saveConfig(validConfig);
      const loaded = loadConfig();
      expect(loaded).toEqual(validConfig);
    });
    it("returns null when localStorage is empty", () => {
      expect(loadConfig()).toBeNull();
    });
    it("returns null when localStorage has invalid JSON", () => {
      localStorage.setItem("timestack-config", "not json");
      expect(loadConfig()).toBeNull();
    });
    it("returns null when config fails validation", () => {
      localStorage.setItem("timestack-config", JSON.stringify({ version: 999 }));
      expect(loadConfig()).toBeNull();
    });
  });
});
