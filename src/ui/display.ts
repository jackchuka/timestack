import type { TreeNode, FlatSegment, SegmentState } from "../types";

export function formatTime(ms: number, ceil = true): string {
  const round = ceil ? Math.ceil : Math.floor;
  const totalSeconds = round(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getAncestors(node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [];
  let current = node.parent;
  while (current) {
    result.unshift(current);
    current = current.parent;
  }
  return result;
}

function buildBreadcrumb(container: HTMLElement, nodes: TreeNode[]): void {
  container.textContent = "";
  nodes.forEach((n, i) => {
    if (i > 0) {
      const sep = document.createTextNode(" \u203A ");
      container.appendChild(sep);
    }
    const span = document.createElement("span");
    span.textContent = n.name;
    container.appendChild(span);
  });
}

export function createDisplay(
  container: HTMLElement,
  callbacks?: { onRestart?: () => void },
): {
  update: (
    segment: FlatSegment,
    state: SegmentState,
    remainingMs: number,
    overtimeMs: number,
    totalElapsedMs: number,
    totalDurationMs: number,
    nextSegment: FlatSegment | null,
  ) => void;
  showStart: (title: string, totalDuration: string) => void;
  showFinished: (totalElapsedMs: number) => void;
} {
  // CRITICAL: Use a content div so controls (appended to container later) are not destroyed
  const content = document.createElement("div");
  content.className = "timer-panel__content";
  container.classList.add("timer-panel");
  container.appendChild(content);

  const breadcrumbEl = document.createElement("div");
  breadcrumbEl.className = "breadcrumb";
  breadcrumbEl.setAttribute("aria-label", "Breadcrumb");

  const timerEl = document.createElement("div");
  timerEl.className = "timer-display";
  timerEl.setAttribute("aria-live", "assertive");

  const nameEl = document.createElement("div");
  nameEl.className = "segment-name";

  const labelEl = document.createElement("div");
  labelEl.className = "state-label";

  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-container";

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "progress-fill";
  progressBar.appendChild(progressFill);

  const progressText = document.createElement("div");
  progressText.className = "progress-text";

  progressContainer.append(progressBar, progressText);

  const nextUpEl = document.createElement("div");
  nextUpEl.className = "next-up";

  function showTimerElements(): void {
    content.textContent = "";
    content.append(breadcrumbEl, timerEl, nameEl, labelEl, progressContainer, nextUpEl);
  }

  return {
    update(segment, state, remainingMs, overtimeMs, totalElapsedMs, totalDurationMs, nextSegment) {
      // Re-attach timer elements if replaced by start/finished screen
      if (!content.contains(timerEl)) showTimerElements();

      // Breadcrumb (safe — uses textContent per node)
      const ancestors = getAncestors(segment.node);
      buildBreadcrumb(breadcrumbEl, [...ancestors, segment.node]);

      // Timer
      const isOvertime = state === "overtime";
      const displayMs = isOvertime ? overtimeMs : remainingMs;
      const prefix = isOvertime ? "+" : "";
      timerEl.textContent = prefix + formatTime(displayMs);
      timerEl.className = `timer-display timer-display--${state}`;

      // Segment name
      nameEl.textContent = segment.node.name;
      nameEl.style.color = segment.node.color;

      // State label
      labelEl.textContent = state.toUpperCase();
      labelEl.className = `state-label state-label--${state}`;

      // Progress
      const pct = totalDurationMs > 0 ? Math.min(100, (totalElapsedMs / totalDurationMs) * 100) : 0;
      progressFill.style.width = `${pct}%`;
      progressFill.style.background = segment.node.color;
      progressText.textContent = `${formatTime(totalElapsedMs, false)} / ${formatTime(totalDurationMs, false)}`;

      // Next up
      nextUpEl.textContent = nextSegment
        ? `Next: ${nextSegment.node.name} (${formatTime(nextSegment.node.durationMs)})`
        : "Last segment";
    },

    showStart(title, totalDuration) {
      content.textContent = "";
      const screen = document.createElement("div");
      screen.className = "start-screen";

      const h1 = document.createElement("h1");
      h1.textContent = title;

      const pTotal = document.createElement("p");
      pTotal.textContent = `Total: ${totalDuration}`;

      const pHint = document.createElement("p");
      pHint.textContent = "Press Play or Space to begin";

      screen.append(h1, pTotal, pHint);
      content.appendChild(screen);
    },

    showFinished(totalElapsedMs) {
      // Already showing finished screen — don't rebuild (preserves button listeners)
      if (content.querySelector(".finished-screen")) return;

      content.textContent = "";
      const screen = document.createElement("div");
      screen.className = "finished-screen";

      const h2 = document.createElement("h2");
      h2.textContent = "Meeting Complete";

      const p = document.createElement("p");
      p.textContent = `Total time: ${formatTime(totalElapsedMs)}`;

      screen.append(h2, p);

      if (callbacks?.onRestart) {
        const restartBtn = document.createElement("button");
        restartBtn.className = "finished-screen__restart";
        restartBtn.textContent = "⟲ Restart";
        restartBtn.addEventListener("click", callbacks.onRestart);
        screen.appendChild(restartBtn);
      }

      content.appendChild(screen);
    },
  };
}
