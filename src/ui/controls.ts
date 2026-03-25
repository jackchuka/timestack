import type { SegmentState } from "../types";
import { icons } from "./icons";

interface ControlActions {
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onBack: () => void;
  onExtend: () => void;
  onShrink: () => void;
  onReset: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
}

export function createControls(
  container: HTMLElement,
  actions: ControlActions,
): {
  update: (state: SegmentState, isFirst: boolean) => void;
  getContainer: () => HTMLElement;
  destroy: () => void;
  isLocked: () => boolean;
  toggleLock: () => void;
  setMuted: (muted: boolean) => void;
} {
  const controls = document.createElement("div");
  controls.className = "controls";

  const backBtn = makeBtn("Back", icons.skipBack, actions.onBack);
  const skipBtn = makeBtn("Skip", icons.skipForward, actions.onSkip);
  const shrinkBtn = makeBtn("-30s", icons.minus, actions.onShrink);
  const extendBtn = makeBtn("+30s", icons.plus, actions.onExtend);
  const resetBtn = makeBtn("Reset", icons.rotateCcw, actions.onReset);

  const playPauseBtn = document.createElement("button");
  playPauseBtn.className = "btn btn--primary";
  playPauseBtn.title = "Play";
  playPauseBtn.innerHTML = icons.play;
  playPauseBtn.onclick = actions.onPlay;

  // Lock button
  let locked = false;

  const lockBtn = document.createElement("button");
  lockBtn.className = "btn";
  lockBtn.title = "Lock";
  lockBtn.innerHTML = icons.lockOpen;
  lockBtn.setAttribute("aria-pressed", "false");
  lockBtn.addEventListener("click", () => toggleLock());

  function toggleLock(): void {
    locked = !locked;
    lockBtn.innerHTML = locked ? icons.lock : icons.lockOpen;
    lockBtn.title = locked ? "Unlock" : "Lock";
    lockBtn.setAttribute("aria-pressed", String(locked));
    lockBtn.classList.toggle("btn--locked", locked);
  }

  // Mute button
  let muted = false;

  const muteBtn = document.createElement("button");
  muteBtn.className = "btn";
  muteBtn.title = "Mute (M)";
  muteBtn.innerHTML = icons.volume;
  muteBtn.addEventListener("click", () => actions.onToggleMute());

  function setMuted(m: boolean): void {
    muted = m;
    muteBtn.innerHTML = muted ? icons.volumeOff : icons.volume;
    muteBtn.title = muted ? "Unmute (M)" : "Mute (M)";
    muteBtn.classList.toggle("btn--muted", muted);
  }

  const topRow = document.createElement("div");
  topRow.className = "controls__row";
  topRow.append(backBtn, playPauseBtn, skipBtn);

  const bottomRow = document.createElement("div");
  bottomRow.className = "controls__row";
  bottomRow.append(shrinkBtn, resetBtn, lockBtn, muteBtn, extendBtn);

  controls.append(topRow, bottomRow);
  container.appendChild(controls);

  // Keyboard shortcuts — stored as named function for cleanup
  function onKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case "l":
      case "L":
        toggleLock();
        return;
      case "f":
      case "F":
        actions.onToggleFullscreen();
        return;
      case "m":
      case "M":
        actions.onToggleMute();
        return;
    }
    if (locked) return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        playPauseBtn.click();
        break;
      case "ArrowRight":
        actions.onSkip();
        break;
      case "ArrowLeft":
        actions.onBack();
        break;
      case "+":
      case "=":
        actions.onExtend();
        break;
      case "-":
        actions.onShrink();
        break;
      case "r":
      case "R":
        actions.onReset();
        break;
    }
  }

  document.addEventListener("keydown", onKeydown);

  return {
    update(state, isFirst) {
      const isActive = state === "running" || state === "warning" || state === "overtime";
      const isPaused = state === "paused";

      if (isActive) {
        playPauseBtn.innerHTML = icons.pause;
        playPauseBtn.title = "Pause";
        playPauseBtn.onclick = actions.onPause;
      } else {
        playPauseBtn.innerHTML = icons.play;
        playPauseBtn.title = "Play";
        playPauseBtn.onclick = actions.onPlay;
      }
      playPauseBtn.classList.toggle("btn--primary", isActive || isPaused);

      if (locked) {
        playPauseBtn.disabled = true;
        backBtn.disabled = true;
        skipBtn.disabled = true;
        shrinkBtn.disabled = true;
        extendBtn.disabled = true;
        resetBtn.disabled = true;
        return;
      }

      playPauseBtn.disabled = false;
      backBtn.disabled = isFirst;
      skipBtn.disabled = false;
      const timeAdjustDisabled = state === "pending" || state === "done";
      shrinkBtn.disabled = timeAdjustDisabled;
      extendBtn.disabled = timeAdjustDisabled;
      resetBtn.disabled = timeAdjustDisabled;
    },
    getContainer: () => controls,
    destroy() {
      document.removeEventListener("keydown", onKeydown);
    },
    isLocked: () => locked,
    toggleLock,
    setMuted,
  };
}

function makeBtn(title: string, iconHtml: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.title = title;
  btn.innerHTML = iconHtml;
  btn.addEventListener("click", onClick);
  return btn;
}
