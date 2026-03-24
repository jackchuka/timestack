// src/persistence.ts
import type { ConfigFile } from "./types";
import { validateConfig } from "./config";

const STORAGE_KEY = "timestack-config";

export function loadConfig(): ConfigFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as ConfigFile;
    validateConfig(config);
    return config;
  } catch {
    return null;
  }
}

export function saveConfig(config: ConfigFile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function downloadConfig(config: ConfigFile): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "timestack-config.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importConfigFromFile(): Promise<ConfigFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        let config: ConfigFile;
        try {
          config = JSON.parse(reader.result as string) as ConfigFile;
        } catch (e) {
          reject(new Error(`Invalid JSON: ${(e as Error).message}`));
          return;
        }
        try {
          validateConfig(config);
          resolve(config);
        } catch (e) {
          reject(new Error(`Invalid config: ${(e as Error).message}`));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
    input.click();
  });
}
