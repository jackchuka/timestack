import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimerEngine } from "../src/timer-engine";
import { resolveTree, flattenLeaves } from "../src/config";
import type { FlatSegment, GlobalConfig } from "../src/types";

const globals: GlobalConfig = { defaultMode: "hard", warningAt: 5 };

function makeSegments(
  nodes: Array<{ name: string; duration: string; mode?: "hard" | "soft" }>,
): FlatSegment[] {
  const tree = resolveTree({ name: "Root", children: nodes }, globals);
  return flattenLeaves(tree);
}

describe("TimerEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Starts in idle phase, pending state
  it("starts in idle phase with pending segmentState", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    const state = engine.getState();
    expect(state.phase).toBe("idle");
    expect(state.segmentState).toBe("pending");
    expect(state.currentIndex).toBe(0);
  });

  // 2. play() starts first segment in running state
  it("play() transitions to running state", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    const state = engine.getState();
    expect(state.phase).toBe("running");
    expect(state.segmentState).toBe("running");
    expect(state.remainingMs).toBe(60_000);
  });

  // 3. tick() transitions running -> warning when remainingMs <= warningAt * 1000
  it("tick() transitions running -> warning when remainingMs <= warningAt seconds", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    // Advance to 5s remaining (warningAt = 5s)
    engine.tick(55_000);
    expect(engine.getState().segmentState).toBe("warning");
    expect(engine.getState().remainingMs).toBe(5_000);
  });

  // 4. Hard mode auto-advances at zero (running next segment)
  it("hard mode auto-advances to next segment at zero", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m", mode: "hard" },
      { name: "B", duration: "2m", mode: "hard" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(60_000);
    const state = engine.getState();
    expect(state.currentIndex).toBe(1);
    expect(state.segmentState).toBe("running");
    expect(state.remainingMs).toBe(120_000);
  });

  // 5. Soft mode enters overtime at zero
  it("soft mode enters overtime at zero", () => {
    const segments = makeSegments([{ name: "A", duration: "1m", mode: "soft" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(60_000);
    const state = engine.getState();
    expect(state.segmentState).toBe("overtime");
    expect(state.currentIndex).toBe(0);
    expect(state.remainingMs).toBe(0);
  });

  // 6. Overtime counts up on tick
  it("overtime counts up overtimeMs on tick", () => {
    const segments = makeSegments([{ name: "A", duration: "1m", mode: "soft" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(60_000); // hits zero -> overtime
    engine.tick(5_000); // 5s into overtime
    const state = engine.getState();
    expect(state.segmentState).toBe("overtime");
    expect(state.overtimeMs).toBe(5_000);
    expect(state.remainingMs).toBe(0);
  });

  // 7. Pause freezes timer (tick has no effect)
  it("pause freezes timer — tick has no effect", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.pause();
    const before = engine.getState().remainingMs;
    engine.tick(10_000);
    expect(engine.getState().remainingMs).toBe(before);
    expect(engine.getState().segmentState).toBe("paused");
  });

  // 8. Resume restores previous state
  it("resume restores previous state after pause", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(30_000); // 30s elapsed, still running
    engine.pause();
    expect(engine.getState().segmentState).toBe("paused");
    engine.play(); // resume
    expect(engine.getState().segmentState).toBe("running");
    expect(engine.getState().remainingMs).toBe(30_000);
  });

  // 9. Skip advances to next segment
  it("skip advances to next segment in running state", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.skip();
    const state = engine.getState();
    expect(state.currentIndex).toBe(1);
    expect(state.segmentState).toBe("running");
    expect(state.remainingMs).toBe(120_000);
  });

  // 10. Skip on last segment -> phase = "finished"
  it("skip on last segment sets phase to finished", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.skip();
    expect(engine.getState().phase).toBe("finished");
    expect(engine.getState().segmentState).toBe("done");
  });

  // 11. Back goes to previous segment, paused, full duration
  it("back goes to previous segment paused at full duration", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.skip(); // now on B
    engine.back(); // back to A
    const state = engine.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.segmentState).toBe("paused");
    expect(state.remainingMs).toBe(60_000);
  });

  // 12. Back on first segment is no-op
  it("back on first segment is a no-op", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(10_000);
    engine.back(); // no-op: already on index 0
    const state = engine.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.remainingMs).toBe(50_000);
  });

  // 13. Extend adds 30s to remaining
  it("extend adds 30s to remaining in running state", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(10_000); // 50s remaining
    engine.extend();
    expect(engine.getState().remainingMs).toBe(80_000);
  });

  // 14. Extend in warning reverts to running if above threshold
  it("extend in warning reverts to running state", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(55_000); // 5s remaining -> warning
    expect(engine.getState().segmentState).toBe("warning");
    engine.extend(); // 5s + 30s = 35s > warningAt(5s)
    const state = engine.getState();
    expect(state.remainingMs).toBe(35_000);
    expect(state.segmentState).toBe("running");
  });

  // 15. Extend in overtime gives FULL 30s countdown
  it("extend in overtime gives full 30s countdown", () => {
    const segments = makeSegments([{ name: "A", duration: "1m", mode: "soft" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(60_000); // -> overtime
    engine.tick(10_000); // 10s overtime
    expect(engine.getState().segmentState).toBe("overtime");
    expect(engine.getState().overtimeMs).toBe(10_000);
    engine.extend();
    const state = engine.getState();
    expect(state.remainingMs).toBe(30_000);
    expect(state.overtimeMs).toBe(0);
    expect(state.segmentState).toBe("running");
  });

  // 16. Reset restarts segment paused with original duration
  it("reset restarts current segment paused at original duration", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(30_000); // 30s elapsed
    engine.reset();
    const state = engine.getState();
    expect(state.segmentState).toBe("paused");
    expect(state.remainingMs).toBe(60_000);
    expect(state.overtimeMs).toBe(0);
  });

  // 17. jumpTo sets target segment paused with full duration
  it("jumpTo sets target segment paused with full duration", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
      { name: "C", duration: "3m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.jumpTo(2);
    const state = engine.getState();
    expect(state.currentIndex).toBe(2);
    expect(state.segmentState).toBe("paused");
    expect(state.remainingMs).toBe(180_000);
  });

  // 18. totalElapsedMs tracks elapsed time
  it("totalElapsedMs tracks total elapsed time across ticks", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(20_000);
    engine.tick(15_000);
    expect(engine.getState().totalElapsedMs).toBe(35_000);
  });

  // pause is valid in warning state
  it("pause works in warning state", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(55_000); // -> warning
    engine.pause();
    expect(engine.getState().segmentState).toBe("paused");
    expect(engine.getState().pausedFrom).toBe("warning");
  });

  // pause is valid in overtime state
  it("pause works in overtime state", () => {
    const segments = makeSegments([{ name: "A", duration: "1m", mode: "soft" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(65_000); // -> overtime
    engine.pause();
    expect(engine.getState().segmentState).toBe("paused");
    expect(engine.getState().pausedFrom).toBe("overtime");
  });

  // tick during paused is no-op
  it("tick during pending/finished is a no-op", () => {
    const segments = makeSegments([{ name: "A", duration: "1m" }]);
    const engine = new TimerEngine(segments);
    // pending
    engine.tick(10_000);
    expect(engine.getState().segmentState).toBe("pending");
    // finished
    engine.play();
    engine.skip();
    engine.tick(10_000);
    expect(engine.getState().phase).toBe("finished");
  });

  // 19. restart() resets to segment 0 paused with totalElapsedMs = 0
  it("restart resets to segment 0 paused and clears totalElapsedMs", () => {
    const segments = makeSegments([
      { name: "A", duration: "1m" },
      { name: "B", duration: "2m" },
    ]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(30_000);
    engine.skip(); // now on B
    engine.tick(10_000);
    expect(engine.getState().totalElapsedMs).toBe(40_000);
    engine.restart();
    const state = engine.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.segmentState).toBe("paused");
    expect(state.remainingMs).toBe(60_000);
    expect(state.overtimeMs).toBe(0);
    expect(state.totalElapsedMs).toBe(0);
  });

  // hard mode auto-advance on last segment finishes the meeting
  it("hard mode auto-advance on last segment sets phase to finished", () => {
    const segments = makeSegments([{ name: "A", duration: "1m", mode: "hard" }]);
    const engine = new TimerEngine(segments);
    engine.play();
    engine.tick(60_000);
    expect(engine.getState().phase).toBe("finished");
    expect(engine.getState().segmentState).toBe("done");
  });
});
