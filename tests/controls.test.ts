import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createControls } from "../src/ui/controls";
import type { SegmentState } from "../src/types";

function noop() {}
const actions = {
  onPlay: noop,
  onPause: noop,
  onSkip: noop,
  onBack: noop,
  onExtend: noop,
  onShrink: noop,
  onReset: noop,
  onToggleMute: noop,
  onToggleFullscreen: noop,
  onToggleSidebar: noop,
};

describe("createControls lock", () => {
  let container: HTMLElement;
  let ctrl: ReturnType<typeof createControls>;

  beforeEach(() => {
    container = document.createElement("div");
    ctrl = createControls(container, actions);
  });

  afterEach(() => {
    ctrl.destroy();
  });

  it("starts unlocked", () => {
    expect(ctrl.isLocked()).toBe(false);
  });

  it("isLocked returns true after toggling lock", () => {
    ctrl.toggleLock();
    expect(ctrl.isLocked()).toBe(true);
  });

  it("toggleLock toggles back to unlocked", () => {
    ctrl.toggleLock();
    ctrl.toggleLock();
    expect(ctrl.isLocked()).toBe(false);
  });

  it("update() disables all buttons except lock and mute when locked", () => {
    ctrl.toggleLock();
    ctrl.update("running" as SegmentState, false);

    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const exempt = new Set(["Unlock", "Mute (M)", "Unmute (M)"]);
    buttons.forEach((btn) => {
      if (exempt.has(btn.title)) {
        expect(btn.disabled).toBe(false);
      } else {
        expect(btn.disabled).toBe(true);
      }
    });
  });

  it("update() does not override normal disabled logic when unlocked", () => {
    ctrl.update("running" as SegmentState, true);

    const backBtn = container.querySelector<HTMLButtonElement>('button[title="Back"]');
    expect(backBtn?.disabled).toBe(true);
  });

  it("play/pause button re-enables after unlocking", () => {
    ctrl.toggleLock();
    ctrl.update("running" as SegmentState, false);

    const playPauseBtn = container.querySelector<HTMLButtonElement>('button[title="Pause"]');
    expect(playPauseBtn?.disabled).toBe(true);

    ctrl.toggleLock();
    ctrl.update("running" as SegmentState, false);
    expect(playPauseBtn?.disabled).toBe(false);
  });

  it("lock button has aria-pressed attribute", () => {
    const lockBtn = container.querySelector<HTMLButtonElement>('button[title="Lock"]');
    expect(lockBtn?.getAttribute("aria-pressed")).toBe("false");

    ctrl.toggleLock();
    expect(lockBtn?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("createControls lock keyboard", () => {
  let container: HTMLElement;
  let ctrl: ReturnType<typeof createControls>;
  let skipCalled: boolean;
  let muteCalled: boolean;
  let fullscreenCalled: boolean;

  beforeEach(() => {
    container = document.createElement("div");
    skipCalled = false;
    muteCalled = false;
    fullscreenCalled = false;
    ctrl = createControls(container, {
      ...actions,
      onSkip: () => {
        skipCalled = true;
      },
      onToggleMute: () => {
        muteCalled = true;
      },
      onToggleFullscreen: () => {
        fullscreenCalled = true;
      },
    });
  });

  afterEach(() => {
    ctrl.destroy();
  });

  it("L key toggles lock", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "L" }));
    expect(ctrl.isLocked()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "L" }));
    expect(ctrl.isLocked()).toBe(false);
  });

  it("blocks timer shortcuts when locked", () => {
    ctrl.toggleLock();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(skipCalled).toBe(false);
  });

  it("allows F and M when locked", () => {
    ctrl.toggleLock();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "M" }));
    expect(fullscreenCalled).toBe(true);
    expect(muteCalled).toBe(true);
  });
});
