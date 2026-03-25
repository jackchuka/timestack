import "./style.css";

import defaultConfig from "../config/default.json";
import type { ConfigFile, TreeNode, FlatSegment } from "./types";
import { validateConfig, resolveTree, flattenLeaves } from "./config";
import { TimerEngine } from "./timer-engine";
import { AudioManager } from "./audio";
import { loadConfig } from "./persistence";
import { createEditor } from "./ui/editor";
import { createDisplay, formatTime } from "./ui/display";
import { createSidebar } from "./ui/sidebar";
import { createControls } from "./ui/controls";
import { loadTheme, applyTheme } from "./theme";

// ─── Config ───────────────────────────────────────────────────────────────────

let currentConfig = loadConfig() || (defaultConfig as ConfigFile);

// ─── Engine & Audio ───────────────────────────────────────────────────────────

let engine: TimerEngine;
const audio = new AudioManager();

// ─── Mutable state (rebuilt on config change) ─────────────────────────────────

let tree: TreeNode;
let segments: FlatSegment[];
let totalDurationMs: number;
let sidebar: ReturnType<typeof createSidebar>;
let display: ReturnType<typeof createDisplay>;
let controls: ReturnType<typeof createControls>;

// ─── DOM Structure ────────────────────────────────────────────────────────────

const appEl = document.getElementById("app")!;

// Full-width navbar
const navbar = document.createElement("nav");
navbar.className = "navbar";

const navBrand = document.createElement("span");
navBrand.className = "navbar__brand";
const navLogo = document.createElement("img");
navLogo.src = new URL("../assets/logo.svg", import.meta.url).href;
navLogo.alt = "Timestack";
navLogo.className = "navbar__logo";
navBrand.appendChild(navLogo);
navBrand.appendChild(document.createTextNode("Timestack"));
navbar.appendChild(navBrand);

const gearBtn = document.createElement("button");
gearBtn.className = "navbar__gear";
gearBtn.textContent = "⚙";
gearBtn.setAttribute("aria-label", "Edit config");
navbar.appendChild(gearBtn);

// ─── Theme ───────────────────────────────────────────────────────────────────

applyTheme(loadTheme());

appEl.appendChild(navbar);

// Main area (sidebar + timer)
const mainEl = document.createElement("div");
mainEl.className = "main";
appEl.appendChild(mainEl);

// Sidebar element
const sidebarEl = document.createElement("div");
mainEl.appendChild(sidebarEl);

// Timer panel element
const timerPanelEl = document.createElement("div");
mainEl.appendChild(timerPanelEl);

// ─── Hamburger + Backdrop (mobile sidebar toggle) ─────────────────────────────

const hamburger = document.createElement("button");
hamburger.className = "hamburger";
hamburger.title = "Toggle Sidebar";
hamburger.setAttribute("aria-label", "Toggle Sidebar");
hamburger.textContent = "☰";
document.body.appendChild(hamburger);

const backdrop = document.createElement("div");
backdrop.className = "backdrop";
document.body.appendChild(backdrop);

let sidebarOpen = false;

function setSidebarOpen(open: boolean): void {
  sidebarOpen = open;
  sidebarEl.classList.toggle("sidebar--open", open);
  backdrop.classList.toggle("backdrop--visible", open);
  hamburger.classList.toggle("hamburger--hidden", open);
}

hamburger.addEventListener("click", () => setSidebarOpen(!sidebarOpen));
backdrop.addEventListener("click", () => setSidebarOpen(false));

// ─── rAF loop state (reset in reloadConfig) ───────────────────────────────────

let lastTime = 0;
let timeAdjustMs = 0;
let rafId = 0;

// ─── reloadConfig ─────────────────────────────────────────────────────────────

function reloadConfig(config: ConfigFile): void {
  currentConfig = config;
  validateConfig(currentConfig);

  tree = resolveTree(currentConfig.root, currentConfig.config);
  segments = flattenLeaves(tree);
  totalDurationMs = tree.durationMs;

  engine = new TimerEngine(segments);

  // Audio events — engine emits these only during tick(), not during skip/back/jumpTo
  engine.on("warning", () => {
    if (!audio.isMuted()) audio.playWarning();
  });
  engine.on("segmentEnd", () => {
    if (!audio.isMuted()) audio.playEnd();
  });
  engine.on("overtimeTick", () => {
    if (!audio.isMuted()) audio.playOvertimeTick();
  });

  // Clean up old keyboard listener before rebuilding
  if (controls) controls.destroy();

  sidebarEl.innerHTML = "";
  timerPanelEl.innerHTML = "";

  sidebar = createSidebar(sidebarEl, tree, segments, (index) => {
    audio.init();
    engine.jumpTo(index);
    setSidebarOpen(false);
    startLoop();
  });

  display = createDisplay(timerPanelEl, {
    onRestart: () => {
      engine.restart();
      timeAdjustMs = 0;
      startLoop();
    },
  });

  controls = createControls(timerPanelEl, {
    onPlay: () => {
      audio.init();
      engine.play();
      startLoop();
    },
    onPause: () => engine.pause(),
    onSkip: () => {
      audio.init();
      engine.skip();
      startLoop();
    },
    onBack: () => {
      audio.init();
      engine.back();
      startLoop();
    },
    onExtend: () => {
      timeAdjustMs += 30_000;
      engine.extend();
      startLoop();
    },
    onShrink: () => {
      timeAdjustMs -= 30_000;
      engine.shrink();
      startLoop();
    },
    onReset: () => {
      engine.reset();
      startLoop();
    },
    onToggleMute: () => {
      const muted = !audio.isMuted();
      audio.setMuted(muted);
    },
    onToggleFullscreen: () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    onToggleSidebar: () => setSidebarOpen(!sidebarOpen),
  });

  display.showStart(currentConfig.title, formatTime(totalDurationMs));

  // Reset rAF loop state
  stopLoop();
  timeAdjustMs = 0;
}

// ─── Editor ───────────────────────────────────────────────────────────────────

const editor = createEditor(document.body, defaultConfig as ConfigFile, {
  onSave: (config) => reloadConfig(config),
  onClose: () => {},
});

gearBtn.addEventListener("click", () => {
  if (!gearBtn.disabled) editor.open(currentConfig);
});

// ─── Initial setup ────────────────────────────────────────────────────────────

reloadConfig(currentConfig);

// ─── rAF Loop ─────────────────────────────────────────────────────────────────

function startLoop(): void {
  if (rafId) return;
  lastTime = 0;
  rafId = requestAnimationFrame(loop);
}

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function loop(timestamp: number): void {
  rafId = 0;

  // Skip first frame — delta would be invalid
  if (lastTime === 0) {
    lastTime = timestamp;
    rafId = requestAnimationFrame(loop);
    return;
  }

  const delta = timestamp - lastTime;
  lastTime = timestamp;

  // Tick engine
  engine.tick(delta);

  const state = engine.getState();
  const { phase, currentIndex, segmentState, remainingMs, overtimeMs } = state;

  // ─── Update UI ─────────────────────────────────────────────────────────────
  if (phase === "finished") {
    display.showFinished(state.totalElapsedMs);
    sidebar.update(currentIndex, segmentState);
    controls.update(segmentState, currentIndex === 0);
    return; // stop looping
  }

  if (phase === "idle") {
    return; // stop looping — startLoop() resumes on user action
  }

  // phase === "running"
  const segment = segments[currentIndex];
  const nextSegment = currentIndex < segments.length - 1 ? segments[currentIndex + 1] : null;

  const meetingElapsedMs = state.totalElapsedMs;
  const effectiveTotal = Math.max(1, totalDurationMs + timeAdjustMs);

  display.update(
    segment,
    segmentState,
    remainingMs,
    overtimeMs,
    meetingElapsedMs,
    effectiveTotal,
    nextSegment,
  );
  sidebar.update(currentIndex, segmentState);
  controls.update(segmentState, currentIndex === 0);

  rafId = requestAnimationFrame(loop);
}

startLoop();
