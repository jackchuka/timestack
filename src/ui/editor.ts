// src/ui/editor.ts
import type { ConfigFile, ConfigNode, SegmentMode } from "../types";
import { parseDuration, validateConfig } from "../config";
import { saveConfig, downloadConfig, importConfigFromFile } from "../persistence";
import { showAlert, showConfirm } from "./dialog";
import { buildThemeSelector } from "../theme";
import {
  addChild,
  addSibling,
  deleteNode,
  computeDuration,
  validateNode,
  countDescendants,
  findParent,
  getDepth,
  MAX_DEPTH,
  secondsToDurationString,
  DURATION_SLIDER_MIN,
  DURATION_SLIDER_MAX,
  DURATION_SLIDER_STEP,
  DURATION_STEP_BUTTON,
} from "./editor-tree";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditorCallbacks {
  onSave: (config: ConfigFile) => void;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  "#7c9cbf",
  "#7bc5a3",
  "#d4a76a",
  "#9b8ec4",
  "#c97b7b",
  "#b8904e",
  "#6aab96",
  "#a8b4c8",
  "#c9a0c0",
  "#8892a8",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function resolveInheritedMode(node: ConfigNode, config: ConfigFile): SegmentMode {
  const parent = findParent(node, config.root);
  if (parent?.mode) return parent.mode;
  if (parent) return resolveInheritedMode(parent, config);
  return config.config.defaultMode;
}

// ─── createEditor ─────────────────────────────────────────────────────────────

export function createEditor(
  container: HTMLElement,
  defaultConfigJson: ConfigFile,
  callbacks: EditorCallbacks,
): {
  open: (currentConfig: ConfigFile) => void;
  close: () => void;
} {
  // ── State ──────────────────────────────────────────────────────────────────
  let currentConfig: ConfigFile = deepClone(defaultConfigJson);
  let originalJson = JSON.stringify(currentConfig);
  let collapsed = new Set<ConfigNode>();
  let openColorPicker: (() => void) | null = null;

  // Drag state
  let dragNode: ConfigNode | null = null;
  let dragParent: ConfigNode | null = null;

  // ── DOM Shell ──────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "editor-overlay";

  const modal = document.createElement("div");
  modal.className = "editor-modal";

  // Header
  const header = document.createElement("div");
  header.className = "editor-modal__header";

  const title = document.createElement("h2");
  title.className = "editor-modal__title";
  title.textContent = "Edit Configuration";

  const closeBtn = document.createElement("button");
  closeBtn.className = "editor-modal__close";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => requestClose());

  header.append(title, closeBtn);

  // Body
  const body = document.createElement("div");
  body.className = "editor-modal__body";

  // Footer
  const footer = document.createElement("div");
  footer.className = "editor-modal__footer";

  const saveBtn = document.createElement("button");
  saveBtn.className = "editor-modal__btn editor-modal__btn--primary";
  saveBtn.type = "button";
  saveBtn.textContent = "Save";

  const exportBtn = document.createElement("button");
  exportBtn.className = "editor-modal__btn";
  exportBtn.type = "button";
  exportBtn.textContent = "Export";

  const importBtn = document.createElement("button");
  importBtn.className = "editor-modal__btn";
  importBtn.type = "button";
  importBtn.textContent = "Import";

  const resetBtn = document.createElement("button");
  resetBtn.className = "editor-modal__btn editor-modal__btn--danger";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset";

  footer.append(saveBtn, exportBtn, importBtn, resetBtn);

  modal.append(header, body, footer);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  // ── Dirty tracking ─────────────────────────────────────────────────────────
  function isDirty(): boolean {
    return JSON.stringify(currentConfig) !== originalJson;
  }

  function isValid(): boolean {
    try {
      validateConfig(currentConfig);
      return true;
    } catch {
      return false;
    }
  }

  // ── Request close (with dirty check) ──────────────────────────────────────
  async function requestClose(): Promise<void> {
    if (isDirty()) {
      if (!(await showConfirm("You have unsaved changes. Close anyway?"))) return;
    }
    close();
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") requestClose();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(): void {
    // Close any open color picker
    if (openColorPicker) {
      openColorPicker();
    }
    openColorPicker = null;

    body.textContent = "";

    // Theme selector
    const themeSection = document.createElement("div");
    themeSection.className = "editor-theme";

    const themeLabel = document.createElement("label");
    themeLabel.className = "editor-global__label";
    themeLabel.textContent = "Theme";

    themeSection.append(themeLabel, buildThemeSelector());
    body.appendChild(themeSection);

    // Global settings section
    body.appendChild(buildGlobalSettings());

    // Tree section
    const treeSection = document.createElement("div");
    treeSection.className = "editor-tree";
    renderNode(currentConfig.root, null, -1, 0, treeSection);
    body.appendChild(treeSection);
    treeContainer = treeSection;

    // Update save button state
    const dirty = isDirty();
    const valid = isValid();
    saveBtn.disabled = !dirty || !valid;
    saveBtn.textContent = dirty ? "Save *" : "Saved";
    saveBtn.className =
      dirty && valid ? "editor-modal__btn editor-modal__btn--primary" : "editor-modal__btn";
  }

  // ── Global settings ────────────────────────────────────────────────────────
  function buildGlobalSettings(): HTMLElement {
    const section = document.createElement("div");
    section.className = "editor-global";

    // Meeting title
    const titleGroup = document.createElement("div");
    titleGroup.className = "editor-global__field";

    const titleLabel = document.createElement("label");
    titleLabel.className = "editor-global__label";
    titleLabel.textContent = "Meeting Title";

    const titleInput = document.createElement("input");
    titleInput.className = "editor-global__input";
    titleInput.type = "text";
    titleInput.value = currentConfig.title;
    titleInput.addEventListener("input", () => {
      currentConfig.title = titleInput.value;
      updateSaveBtn();
    });

    titleGroup.append(titleLabel, titleInput);

    // Default mode
    const modeGroup = document.createElement("div");
    modeGroup.className = "editor-global__field";

    const modeLabel = document.createElement("label");
    modeLabel.className = "editor-global__label";
    modeLabel.textContent = "Default Mode";

    const modeToggle = buildModeToggle(currentConfig.config.defaultMode, (mode) => {
      currentConfig.config.defaultMode = mode;
      updateSaveBtn();
      // Re-render tree because inherited modes may change display
      renderTree();
    });

    modeGroup.append(modeLabel, modeToggle);

    // Warning at
    const warningGroup = document.createElement("div");
    warningGroup.className = "editor-global__field";

    const warningLabel = document.createElement("label");
    warningLabel.className = "editor-global__label";
    warningLabel.textContent = "Warning At (seconds)";

    const warningInput = document.createElement("input");
    warningInput.className = "editor-global__input";
    warningInput.type = "number";
    warningInput.min = "1";
    warningInput.max = "300";
    warningInput.value = String(currentConfig.config.warningAt);
    warningInput.addEventListener("input", () => {
      const val = parseInt(warningInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 300) {
        currentConfig.config.warningAt = val;
        updateSaveBtn();
      }
    });

    warningGroup.append(warningLabel, warningInput);

    section.append(titleGroup, modeGroup, warningGroup);
    return section;
  }

  // ── Mode toggle ────────────────────────────────────────────────────────────
  function buildModeToggle(value: SegmentMode, onChange: (mode: SegmentMode) => void): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "editor-mode-toggle";

    const hardBtn = document.createElement("button");
    hardBtn.type = "button";
    hardBtn.textContent = "hard";
    hardBtn.className =
      "editor-mode-toggle__btn" + (value === "hard" ? " editor-mode-toggle__btn--active" : "");

    const softBtn = document.createElement("button");
    softBtn.type = "button";
    softBtn.textContent = "soft";
    softBtn.className =
      "editor-mode-toggle__btn" + (value === "soft" ? " editor-mode-toggle__btn--active" : "");

    hardBtn.addEventListener("click", () => {
      if (value !== "hard") {
        value = "hard";
        hardBtn.className = "editor-mode-toggle__btn editor-mode-toggle__btn--active";
        softBtn.className = "editor-mode-toggle__btn";
        onChange("hard");
      }
    });

    softBtn.addEventListener("click", () => {
      if (value !== "soft") {
        value = "soft";
        softBtn.className = "editor-mode-toggle__btn editor-mode-toggle__btn--active";
        hardBtn.className = "editor-mode-toggle__btn";
        onChange("soft");
      }
    });

    wrap.append(hardBtn, softBtn);
    return wrap;
  }

  // ── Render tree section only ───────────────────────────────────────────────
  let treeContainer: HTMLElement | null = null;

  function renderTree(): void {
    if (!treeContainer) return;
    treeContainer.textContent = "";
    renderNode(currentConfig.root, null, -1, 0, treeContainer);
    updateSaveBtn();
  }

  function updateSaveBtn(): void {
    const dirty = isDirty();
    const valid = isValid();
    saveBtn.disabled = !dirty || !valid;
    saveBtn.textContent = dirty ? "Save *" : "Saved";
    saveBtn.className =
      dirty && valid ? "editor-modal__btn editor-modal__btn--primary" : "editor-modal__btn";
  }

  // ── Render a single node (recursive) ──────────────────────────────────────
  function renderNode(
    node: ConfigNode,
    parent: ConfigNode | null,
    indexInParent: number,
    depth: number,
    container: HTMLElement,
  ): void {
    const errors = validateNode(node);
    const hasErrors = errors.length > 0;
    const isParentNode = !!node.children;
    const isCollapsed = collapsed.has(node);

    // Card
    const card = document.createElement("div");
    card.className =
      "editor-node" +
      (hasErrors ? " editor-node--invalid" : "") +
      (isParentNode ? " editor-node--parent" : " editor-node--leaf");
    card.style.marginLeft = `${depth * 16}px`;

    // Drag handle
    const dragHandle = document.createElement("span");
    dragHandle.className = "editor-node__drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.draggable = true;

    dragHandle.addEventListener("dragstart", (e) => {
      dragNode = node;
      dragParent = parent;
      card.classList.add("editor-node--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "");
      }
    });

    dragHandle.addEventListener("dragend", () => {
      card.classList.remove("editor-node--dragging");
      dragNode = null;
      dragParent = null;
    });

    card.addEventListener("dragover", (e) => {
      if (!dragNode || dragNode === node) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const pct = offsetY / rect.height;

      card.classList.remove(
        "editor-node--drop-before",
        "editor-node--drop-after",
        "editor-node--drop-into",
      );

      if (pct < 0.25) {
        card.classList.add("editor-node--drop-before");
      } else if (pct > 0.75) {
        card.classList.add("editor-node--drop-after");
      } else {
        card.classList.add("editor-node--drop-into");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove(
        "editor-node--drop-before",
        "editor-node--drop-after",
        "editor-node--drop-into",
      );
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove(
        "editor-node--drop-before",
        "editor-node--drop-after",
        "editor-node--drop-into",
      );

      if (!dragNode || dragNode === node) return;

      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const pct = offsetY / rect.height;

      const dropZone: "before" | "after" | "into" =
        pct < 0.25 ? "before" : pct > 0.75 ? "after" : "into";

      performDrop(node, parent, indexInParent, depth, dropZone);
    });

    // Color dot
    const colorDot = document.createElement("span");
    colorDot.className = "editor-node__color-dot";
    colorDot.style.backgroundColor = node.color ?? "#94a3b8";
    colorDot.title = "Pick color";

    colorDot.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close existing picker
      if (openColorPicker) openColorPicker();
      openColorPicker = showColorPicker(colorDot, node, () => {
        openColorPicker = null;
        renderTree();
      });
    });

    // Name input
    const nameInput = document.createElement("input");
    nameInput.className =
      "editor-node__name" + (!node.name?.trim() ? " editor-node__name--error" : "");
    nameInput.type = "text";
    nameInput.placeholder = "Segment name";
    nameInput.value = node.name;
    nameInput.addEventListener("input", () => {
      node.name = nameInput.value;
      nameInput.className =
        "editor-node__name" + (!node.name.trim() ? " editor-node__name--error" : "");
      updateSaveBtn();
    });

    // Duration / computed duration
    let durationEl: HTMLElement | null;
    let durationRow: HTMLElement | null = null;

    if (isParentNode) {
      const durationSpan = document.createElement("span");
      durationSpan.className = "editor-node__duration editor-node__duration--computed";
      durationSpan.textContent = computeDuration(node);
      durationEl = durationSpan;
    } else {
      durationEl = null;
      durationRow = buildDurationRow(node);
    }

    // Mode section
    const modeSection = buildNodeModeSection(node);

    // Collapse toggle (only for parents)
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "editor-node__collapse";
    if (isParentNode) {
      collapseBtn.textContent = isCollapsed ? "▸" : "▾";
      collapseBtn.title = isCollapsed ? "Expand" : "Collapse";
      collapseBtn.addEventListener("click", () => {
        if (collapsed.has(node)) {
          collapsed.delete(node);
        } else {
          collapsed.add(node);
        }
        renderTree();
      });
    } else {
      collapseBtn.style.visibility = "hidden";
    }

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "editor-node__delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";
    if (parent === null) {
      // Root node cannot be deleted
      deleteBtn.disabled = true;
    } else {
      deleteBtn.addEventListener("click", async () => {
        const childCount = countDescendants(node);
        if (childCount > 0) {
          const ok = await showConfirm(
            `Delete "${node.name || "this node"}" and its ${childCount} descendant${childCount !== 1 ? "s" : ""}?`,
          );
          if (!ok) return;
        }
        collapsed.delete(node);
        deleteNode(parent, indexInParent);
        renderTree();
      });
    }

    // Add child button
    const addChildBtn = document.createElement("button");
    addChildBtn.type = "button";
    addChildBtn.className = "editor-node__add-child";
    addChildBtn.textContent = "+ child";
    addChildBtn.title = "Add child";
    const nodeDepth = getDepth(node, currentConfig.root);
    if (nodeDepth >= MAX_DEPTH) {
      addChildBtn.disabled = true;
      addChildBtn.title = `Max depth (${MAX_DEPTH}) reached`;
    } else {
      addChildBtn.addEventListener("click", () => {
        addChild(node, nodeDepth);
        collapsed.delete(node); // expand so children are visible
        renderTree();
      });
    }

    // Add sibling button
    const addSiblingBtn = document.createElement("button");
    addSiblingBtn.type = "button";
    addSiblingBtn.className = "editor-node__add-sibling";
    addSiblingBtn.textContent = "+ sibling";
    addSiblingBtn.title = "Add sibling";
    if (parent === null) {
      addSiblingBtn.disabled = true;
    } else {
      addSiblingBtn.addEventListener("click", () => {
        addSibling(parent, indexInParent);
        renderTree();
      });
    }

    // Row assembly
    const row = document.createElement("div");
    row.className = "editor-node__row";
    row.append(dragHandle, colorDot, nameInput);
    if (durationEl) row.append(durationEl);
    row.append(modeSection, collapseBtn, deleteBtn, addChildBtn, addSiblingBtn);

    card.appendChild(row);
    if (durationRow) card.appendChild(durationRow);
    container.appendChild(card);

    // Children (recursive, only if not collapsed)
    if (isParentNode && !isCollapsed) {
      node.children!.forEach((child, i) => {
        renderNode(child, node, i, depth + 1, container);
      });
    }
  }

  // ── Duration row (slider + text input) for leaf nodes ─────────────────────
  // Per-row closure: state lives in the DOM nodes built here. renderTree() rebuilds
  // every node from scratch, so this function does not need to handle re-syncing.
  function buildDurationRow(node: ConfigNode): HTMLElement {
    const row = document.createElement("div");
    row.className = "editor-node__duration-row";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "editor-node__duration-slider";
    slider.min = String(DURATION_SLIDER_MIN);
    slider.max = String(DURATION_SLIDER_MAX);
    slider.step = String(DURATION_SLIDER_STEP);
    slider.setAttribute("aria-label", "Duration in seconds");

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "editor-node__duration-step";
    decBtn.textContent = "−";
    decBtn.setAttribute("aria-label", `Decrease by ${DURATION_STEP_BUTTON} seconds`);

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = "editor-node__duration-step";
    incBtn.textContent = "+";
    incBtn.setAttribute("aria-label", `Increase by ${DURATION_STEP_BUTTON} seconds`);

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "editor-node__duration-value";
    valueInput.placeholder = "1m";

    function currentSeconds(): number | null {
      if (!node.duration) return null;
      try {
        return Math.round(parseDuration(node.duration) / 1000);
      } catch {
        return null;
      }
    }

    function applyFill(): void {
      const v = Number(slider.value);
      const pct = ((v - DURATION_SLIDER_MIN) / (DURATION_SLIDER_MAX - DURATION_SLIDER_MIN)) * 100;
      slider.style.setProperty("--pct", `${pct}%`);
    }

    function updateStepperState(): void {
      const seconds = currentSeconds();
      if (seconds === null) {
        decBtn.disabled = true;
        incBtn.disabled = true;
        return;
      }
      decBtn.disabled = seconds <= DURATION_SLIDER_MIN;
      incBtn.disabled = seconds >= DURATION_SLIDER_MAX;
    }

    function syncFromNode(): void {
      const seconds = currentSeconds();
      const clampedForSlider = Math.min(
        DURATION_SLIDER_MAX,
        Math.max(DURATION_SLIDER_MIN, seconds ?? DURATION_SLIDER_MIN),
      );
      slider.value = String(clampedForSlider);
      valueInput.value = node.duration ?? "";
      applyFill();
      valueInput.classList.toggle("editor-node__duration--error", seconds === null);
      updateStepperState();
    }

    function applySeconds(seconds: number): void {
      const clamped = Math.min(DURATION_SLIDER_MAX, Math.max(DURATION_SLIDER_MIN, seconds));
      const str = secondsToDurationString(clamped);
      node.duration = str;
      valueInput.value = str;
      slider.value = String(clamped);
      applyFill();
      valueInput.classList.remove("editor-node__duration--error");
      updateStepperState();
      updateSaveBtn();
    }

    slider.addEventListener("input", () => {
      applySeconds(Number(slider.value));
    });

    valueInput.addEventListener("input", () => {
      node.duration = valueInput.value;
      const seconds = currentSeconds();
      if (seconds === null) {
        valueInput.classList.add("editor-node__duration--error");
      } else {
        valueInput.classList.remove("editor-node__duration--error");
        const clampedForSlider = Math.min(
          DURATION_SLIDER_MAX,
          Math.max(DURATION_SLIDER_MIN, seconds),
        );
        slider.value = String(clampedForSlider);
        applyFill();
      }
      updateStepperState();
      updateSaveBtn();
    });

    decBtn.addEventListener("click", () => {
      const seconds = currentSeconds();
      if (seconds === null) return;
      applySeconds(seconds - DURATION_STEP_BUTTON);
    });

    incBtn.addEventListener("click", () => {
      const seconds = currentSeconds();
      if (seconds === null) return;
      applySeconds(seconds + DURATION_STEP_BUTTON);
    });

    syncFromNode();

    row.append(decBtn, slider, incBtn, valueInput);
    return row;
  }

  // ── Node mode section ──────────────────────────────────────────────────────
  function buildNodeModeSection(node: ConfigNode): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "editor-node__mode";

    const inheritedMode = resolveInheritedMode(node, currentConfig);
    const displayMode = node.mode ?? inheritedMode;

    const toggleWrap = document.createElement("div");
    toggleWrap.className = "editor-mode-toggle";

    const hardBtn = document.createElement("button");
    hardBtn.type = "button";
    hardBtn.textContent = "hard";
    hardBtn.className =
      "editor-mode-toggle__btn" +
      (displayMode === "hard" ? " editor-mode-toggle__btn--active" : "");

    const softBtn = document.createElement("button");
    softBtn.type = "button";
    softBtn.textContent = "soft";
    softBtn.className =
      "editor-mode-toggle__btn" +
      (displayMode === "soft" ? " editor-mode-toggle__btn--active" : "");

    hardBtn.addEventListener("click", () => {
      node.mode = "hard";
      renderTree();
    });
    softBtn.addEventListener("click", () => {
      node.mode = "soft";
      renderTree();
    });

    toggleWrap.append(hardBtn, softBtn);
    wrap.appendChild(toggleWrap);

    return wrap;
  }

  // ── Color picker ───────────────────────────────────────────────────────────
  function showColorPicker(anchor: HTMLElement, node: ConfigNode, onClose: () => void): () => void {
    const picker = document.createElement("div");
    picker.className = "editor-color-picker";

    COLORS.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className =
        "editor-color-picker__swatch" +
        (node.color === color ? " editor-color-picker__swatch--active" : "");
      swatch.style.backgroundColor = color;
      swatch.title = color;
      swatch.addEventListener("click", () => {
        node.color = color;
        closePicker();
        onClose();
      });
      picker.appendChild(swatch);
    });

    // Clear option
    const clearSwatch = document.createElement("button");
    clearSwatch.type = "button";
    clearSwatch.className = "editor-color-picker__clear";
    clearSwatch.textContent = "✕ clear";
    clearSwatch.addEventListener("click", () => {
      delete node.color;
      closePicker();
      onClose();
    });
    picker.appendChild(clearSwatch);

    // Position near anchor
    anchor.parentElement?.appendChild(picker);

    const closePicker = (): void => {
      picker.remove();
      document.removeEventListener("click", outsideClick);
    };

    const outsideClick = (e: MouseEvent): void => {
      if (!picker.contains(e.target as Node) && e.target !== anchor) {
        closePicker();
        onClose();
      }
    };

    // Defer to avoid the click that opened the picker closing it immediately
    setTimeout(() => document.addEventListener("click", outsideClick), 0);

    return closePicker;
  }

  // ── Drop logic ─────────────────────────────────────────────────────────────
  function performDrop(
    targetNode: ConfigNode,
    targetParent: ConfigNode | null,
    _targetIndex: number,
    _targetDepth: number,
    zone: "before" | "after" | "into",
  ): void {
    if (!dragNode || !dragParent) return;

    // Prevent dropping a node onto its own descendant
    function isDescendant(ancestor: ConfigNode, candidate: ConfigNode): boolean {
      if (!ancestor.children) return false;
      for (const child of ancestor.children) {
        if (child === candidate || isDescendant(child, candidate)) return true;
      }
      return false;
    }
    if (isDescendant(dragNode, targetNode)) return;

    if (zone === "into") {
      // Check depth constraint
      const targetDepthVal = getDepth(targetNode, currentConfig.root);
      if (targetDepthVal >= MAX_DEPTH) return;

      // Remove from old parent
      if (dragParent.children) {
        const idx = dragParent.children.indexOf(dragNode);
        if (idx !== -1) dragParent.children.splice(idx, 1);
        if (dragParent.children.length === 0) {
          delete dragParent.children;
          dragParent.duration = "1m";
        }
      }

      // Add as last child of target
      if (!targetNode.children) {
        // Convert leaf to parent
        const firstChild: ConfigNode = {
          name: targetNode.name || "Segment",
          duration: targetNode.duration || "1m",
        };
        if (targetNode.mode) {
          firstChild.mode = targetNode.mode;
          delete targetNode.mode;
        }
        if (targetNode.color) {
          firstChild.color = targetNode.color;
          delete targetNode.color;
        }
        delete targetNode.duration;
        targetNode.children = [firstChild];
      }
      targetNode.children.push(dragNode);
    } else {
      // Sibling reorder
      if (!targetParent?.children) return;

      // Remove from old parent
      if (dragParent.children) {
        const fromIdx = dragParent.children.indexOf(dragNode);
        if (fromIdx !== -1) dragParent.children.splice(fromIdx, 1);
        if (dragParent.children.length === 0) {
          delete dragParent.children;
          dragParent.duration = "1m";
        }
      }

      // Compute new index in target parent (may have shifted after removal)
      let insertAt = targetParent.children.indexOf(targetNode);
      if (insertAt === -1) return;
      if (zone === "after") insertAt += 1;

      targetParent.children.splice(insertAt, 0, dragNode);
    }

    dragNode = null;
    dragParent = null;

    renderTree();
  }

  // ── Footer actions ─────────────────────────────────────────────────────────
  saveBtn.addEventListener("click", async () => {
    try {
      validateConfig(currentConfig);
      saveConfig(currentConfig);
    } catch (e) {
      await showAlert(`Save failed: ${(e as Error).message}`);
      return;
    }
    originalJson = JSON.stringify(currentConfig);
    updateSaveBtn();
    callbacks.onSave(deepClone(currentConfig));
  });

  exportBtn.addEventListener("click", () => {
    downloadConfig(currentConfig);
  });

  importBtn.addEventListener("click", () => {
    importConfigFromFile()
      .then((imported) => {
        currentConfig = imported;
        // Note: originalJson is NOT updated on import
        collapsed = new Set();
        render();
      })
      .catch(async (e: Error) => {
        await showAlert(`Import failed: ${e.message}`);
      });
  });

  resetBtn.addEventListener("click", async () => {
    if (!(await showConfirm("Reset to default configuration?"))) return;
    currentConfig = deepClone(defaultConfigJson);
    collapsed = new Set();
    render();
  });

  // Overlay click closes (only if clicking directly on overlay, not modal)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) requestClose();
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  function open(config: ConfigFile): void {
    currentConfig = deepClone(config);
    originalJson = JSON.stringify(currentConfig);
    collapsed = new Set();
    render();
    overlay.classList.add("editor-overlay--open");
    document.removeEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", onKeyDown);
  }

  function close(): void {
    overlay.classList.remove("editor-overlay--open");
    document.removeEventListener("keydown", onKeyDown);
    if (openColorPicker) {
      openColorPicker();
      openColorPicker = null;
    }
    callbacks.onClose();
  }

  return { open, close };
}
