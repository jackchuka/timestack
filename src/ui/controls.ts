import type { SegmentState } from "../types";

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
} {
  const controls = document.createElement("div");
  controls.className = "controls";

  const backBtn = makeBtn("Back", "←", actions.onBack);
  const skipBtn = makeBtn("Skip", "→", actions.onSkip);
  const shrinkBtn = makeBtn("-30s", "-30", actions.onShrink);
  const extendBtn = makeBtn("+30s", "+30", actions.onExtend);
  const resetBtn = makeBtn("Reset", "↺", actions.onReset);

  // Play/pause uses only onclick (swapped in update), no addEventListener
  const playPauseBtn = document.createElement("button");
  playPauseBtn.className = "btn btn--primary";
  playPauseBtn.title = "Play";
  playPauseBtn.textContent = "▶";
  playPauseBtn.onclick = actions.onPlay;

  controls.append(shrinkBtn, backBtn, playPauseBtn, skipBtn, extendBtn, resetBtn);
  container.appendChild(controls);

  // Keyboard shortcuts — stored as named function for cleanup
  function onKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
      case "f":
      case "F":
        actions.onToggleFullscreen();
        break;
      case "m":
      case "M":
        actions.onToggleMute();
        break;
    }
  }

  document.addEventListener("keydown", onKeydown);

  return {
    update(state, isFirst) {
      const isActive = state === "running" || state === "warning" || state === "overtime";
      const isPaused = state === "paused";

      if (isActive) {
        playPauseBtn.textContent = "⏸";
        playPauseBtn.title = "Pause";
        playPauseBtn.onclick = actions.onPause;
      } else {
        playPauseBtn.textContent = "▶";
        playPauseBtn.title = "Play";
        playPauseBtn.onclick = actions.onPlay;
      }
      playPauseBtn.classList.toggle("btn--primary", isActive || isPaused);

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
  };
}

function makeBtn(title: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.title = title;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}
