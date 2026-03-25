import type { TreeNode, FlatSegment, SegmentState } from "../types";
import { formatTime } from "./display";

type JumpCallback = (index: number) => void;

export function createSidebar(
  container: HTMLElement,
  root: TreeNode,
  segments: FlatSegment[],
  onJump: JumpCallback,
): { update: (currentIndex: number, segmentState: SegmentState) => void } {
  container.innerHTML = "";
  container.classList.add("sidebar");

  // Root node title with total duration
  const titleRow = document.createElement("div");
  titleRow.className = "sidebar-title";
  const titleName = document.createElement("span");
  titleName.textContent = root.name;
  const titleDur = document.createElement("span");
  titleDur.className = "sidebar-title__duration";
  titleDur.textContent = formatTime(root.durationMs);
  titleRow.append(titleName, titleDur);
  container.appendChild(titleRow);

  // Map leaf node id -> segment index for click handling
  const leafIndexMap = new Map<string, number>();
  segments.forEach((seg) => leafIndexMap.set(seg.node.id, seg.index));

  function renderNode(node: TreeNode, depth: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "tree-node";
    el.dataset.nodeId = node.id;
    el.style.paddingLeft = `${16 + depth * 16}px`;

    const dot = document.createElement("span");
    dot.className = `tree-dot tree-dot--${node.mode}`;
    dot.style.background = node.color;

    const name = document.createElement("span");
    name.textContent = node.name;

    const dur = document.createElement("span");
    dur.className = "tree-duration";
    dur.textContent = formatTime(node.durationMs);

    if (node.isLeaf) {
      const badge = document.createElement("span");
      badge.className = `tree-mode tree-mode--${node.mode}`;
      badge.title = node.mode;
      el.append(dot, name, badge, dur);
    } else {
      el.append(dot, name, dur);
    }

    if (node.isLeaf) {
      el.addEventListener("click", () => {
        const idx = leafIndexMap.get(node.id);
        if (idx !== undefined) onJump(idx);
      });
    } else {
      el.classList.add("tree-node--parent");
      el.addEventListener("click", () => {
        const firstLeafIdx = findFirstLeafIndex(node);
        if (firstLeafIdx !== -1) onJump(firstLeafIdx);
      });
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(el);
    if (!node.isLeaf) {
      node.children.forEach((child) => wrapper.appendChild(renderNode(child, depth + 1)));
    }
    return wrapper;
  }

  function findFirstLeafIndex(node: TreeNode): number {
    if (node.isLeaf) return leafIndexMap.get(node.id) ?? -1;
    for (const child of node.children) {
      const idx = findFirstLeafIndex(child);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  root.children.forEach((child) => container.appendChild(renderNode(child, 0)));

  const allNodes = container.querySelectorAll<HTMLElement>(".tree-node");

  return {
    update(currentIndex, segmentState) {
      const activeNode = segments[currentIndex]?.node;
      const activeAncestorIds = new Set<string>();
      if (activeNode) {
        let p = activeNode.parent;
        while (p) {
          activeAncestorIds.add(p.id);
          p = p.parent;
        }
      }

      allNodes.forEach((el) => {
        const nodeId = el.dataset.nodeId!;
        const segIdx = leafIndexMap.get(nodeId);
        const isActiveLeaf = activeNode && nodeId === activeNode.id;
        const isActiveAncestor = activeAncestorIds.has(nodeId);

        el.classList.remove(
          "tree-node--active",
          "tree-node--done",
          "tree-node--future",
          "tree-node--overtime",
        );
        const dot = el.querySelector<HTMLElement>(".tree-dot");
        if (dot) dot.classList.remove("tree-dot--active", "tree-dot--overtime", "tree-dot--done");

        if (isActiveLeaf) {
          el.classList.add("tree-node--active");
          if (segmentState === "overtime") {
            el.classList.add("tree-node--overtime");
            dot?.classList.add("tree-dot--overtime");
          } else {
            dot?.classList.add("tree-dot--active");
          }
          el.setAttribute("aria-current", "step");
        } else {
          el.removeAttribute("aria-current");
          if (segIdx !== undefined) {
            if (segIdx < currentIndex) {
              el.classList.add("tree-node--done");
              dot?.classList.add("tree-dot--done");
            } else {
              el.classList.add("tree-node--future");
            }
          } else if (isActiveAncestor) {
            el.classList.add("tree-node--active");
          }
        }
      });
    },
  };
}
