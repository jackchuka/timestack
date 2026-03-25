import type { FlatSegment, SegmentState, PausedFrom } from "./types";

type Phase = "idle" | "running" | "finished";

type EngineEvent = "warning" | "segmentEnd" | "overtimeTick";
type EventListener = () => void;

interface EngineState {
  phase: Phase;
  currentIndex: number;
  segmentState: SegmentState;
  pausedFrom: PausedFrom | null;
  remainingMs: number;
  overtimeMs: number;
  totalElapsedMs: number;
  segmentStartElapsedMs: number;
}

export class TimerEngine {
  private segments: FlatSegment[];
  private state: EngineState;
  private listeners = new Map<EngineEvent, Set<EventListener>>();
  private lastOvertimeTick = 0;

  constructor(segments: FlatSegment[]) {
    this.segments = segments;
    this.state = {
      phase: "idle",
      currentIndex: 0,
      segmentState: "pending",
      pausedFrom: null,
      remainingMs: segments[0]?.node.durationMs ?? 0,
      overtimeMs: 0,
      totalElapsedMs: 0,
      segmentStartElapsedMs: 0,
    };
  }

  on(event: EngineEvent, listener: EventListener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: EngineEvent, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: EngineEvent): void {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  getState(): Readonly<EngineState> {
    return { ...this.state };
  }

  /** play() acts as both "start" (from idle/pending) and "resume" (from paused) */
  play(): void {
    const { segmentState, phase } = this.state;

    if (phase === "finished") return;

    if (segmentState === "pending") {
      this.mutate({
        phase: "running",
        segmentState: "running",
      });
      return;
    }

    if (segmentState === "paused") {
      const resumeTo = this.state.pausedFrom ?? "running";
      this.mutate({
        segmentState: resumeTo,
        pausedFrom: null,
      });
    }
  }

  pause(): void {
    const { segmentState } = this.state;
    if (segmentState === "running" || segmentState === "warning" || segmentState === "overtime") {
      this.mutate({
        segmentState: "paused",
        pausedFrom: segmentState as PausedFrom,
      });
    }
  }

  skip(): void {
    const { phase, currentIndex } = this.state;
    if (phase === "finished") return;

    // From idle, skip acts as play (start segment 0)
    if (phase === "idle") {
      this.play();
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= this.segments.length) {
      this.mutate({
        phase: "finished",
        segmentState: "done",
        overtimeMs: 0,
      });
    } else {
      this.mutate({
        phase: "running",
        currentIndex: nextIndex,
        segmentState: "running",
        remainingMs: this.segments[nextIndex].node.durationMs,
        overtimeMs: 0,
        pausedFrom: null,
        segmentStartElapsedMs: this.state.totalElapsedMs,
      });
    }
  }

  back(): void {
    const { currentIndex } = this.state;
    if (currentIndex === 0) return; // no-op

    const prevIndex = currentIndex - 1;
    this.mutate({
      phase: "running",
      currentIndex: prevIndex,
      segmentState: "paused",
      pausedFrom: null,
      remainingMs: this.segments[prevIndex].node.durationMs,
      overtimeMs: 0,
      segmentStartElapsedMs: this.state.totalElapsedMs,
    });
  }

  extend(): void {
    const { segmentState, remainingMs } = this.state;
    const EXTEND_MS = 30_000;

    if (segmentState === "overtime") {
      // Full 30s countdown regardless of how much overtime has elapsed
      this.mutate({
        remainingMs: EXTEND_MS,
        overtimeMs: 0,
        segmentState: "running",
      });
      return;
    }

    if (segmentState === "running" || segmentState === "warning" || segmentState === "paused") {
      const newRemaining = remainingMs + EXTEND_MS;
      const seg = this.segments[this.state.currentIndex];
      const warningAtMs = seg.node.warningAtMs;
      const newSegmentState =
        segmentState === "warning" && newRemaining > warningAtMs ? "running" : segmentState;
      this.mutate({
        remainingMs: newRemaining,
        segmentState: newSegmentState,
      });
    }
  }

  shrink(): void {
    const { segmentState, remainingMs } = this.state;
    const SHRINK_MS = 30_000;

    if (segmentState === "running" || segmentState === "warning" || segmentState === "paused") {
      const newRemaining = Math.max(1000, remainingMs - SHRINK_MS);
      const seg = this.segments[this.state.currentIndex];
      const warningAtMs = seg.node.warningAtMs;
      const newSegmentState =
        newRemaining <= warningAtMs && segmentState === "running" ? "warning" : segmentState;
      this.mutate({
        remainingMs: newRemaining,
        segmentState: newSegmentState,
      });
    }
  }

  reset(): void {
    const { currentIndex } = this.state;
    this.mutate({
      phase: "running",
      segmentState: "paused",
      pausedFrom: null,
      remainingMs: this.segments[currentIndex].node.durationMs,
      overtimeMs: 0,
      totalElapsedMs: this.state.segmentStartElapsedMs,
    });
  }

  restart(): void {
    this.mutate({
      phase: "running",
      currentIndex: 0,
      segmentState: "paused",
      pausedFrom: null,
      remainingMs: this.segments[0].node.durationMs,
      overtimeMs: 0,
      totalElapsedMs: 0,
      segmentStartElapsedMs: 0,
    });
  }

  jumpTo(index: number): void {
    if (index < 0 || index >= this.segments.length) return;
    this.mutate({
      phase: "running",
      currentIndex: index,
      segmentState: "paused",
      pausedFrom: null,
      remainingMs: this.segments[index].node.durationMs,
      overtimeMs: 0,
      segmentStartElapsedMs: this.state.totalElapsedMs,
    });
  }

  /**
   * Called each animation frame (or in tests) with elapsed milliseconds.
   * No-op when paused, pending, or finished.
   */
  tick(deltaMs: number): void {
    const { segmentState, phase } = this.state;

    if (
      phase === "finished" ||
      segmentState === "pending" ||
      segmentState === "paused" ||
      segmentState === "done"
    ) {
      return;
    }

    if (segmentState === "overtime") {
      const newOvertimeMs = this.state.overtimeMs + deltaMs;
      this.mutate({
        overtimeMs: newOvertimeMs,
        totalElapsedMs: this.state.totalElapsedMs + deltaMs,
      });

      // Overtime tick every 30s
      const tickInterval = 30_000;
      const currentTick = Math.floor(newOvertimeMs / tickInterval);
      const prevTick = Math.floor(this.lastOvertimeTick / tickInterval);
      if (currentTick > prevTick && newOvertimeMs > 0) {
        this.emit("overtimeTick");
      }
      this.lastOvertimeTick = newOvertimeMs;
      return;
    }

    // running or warning
    const newRemaining = this.state.remainingMs - deltaMs;
    const totalElapsedMs = this.state.totalElapsedMs + deltaMs;
    const seg = this.segments[this.state.currentIndex];

    if (newRemaining <= 0) {
      // Segment expired
      this.emit("segmentEnd");
      const mode = seg.node.mode;
      if (mode === "soft") {
        // Enter overtime
        const overflowMs = Math.abs(newRemaining);
        this.lastOvertimeTick = 0;
        this.mutate({
          segmentState: "overtime",
          remainingMs: 0,
          overtimeMs: overflowMs,
          totalElapsedMs,
        });
      } else {
        // hard mode: auto-advance, carry overflow to next segment
        const overflowMs = Math.abs(newRemaining);
        const nextIndex = this.state.currentIndex + 1;
        if (nextIndex >= this.segments.length) {
          this.mutate({
            phase: "finished",
            segmentState: "done",
            remainingMs: 0,
            overtimeMs: 0,
            totalElapsedMs,
          });
        } else {
          this.mutate({
            currentIndex: nextIndex,
            segmentState: "running",
            remainingMs: Math.max(0, this.segments[nextIndex].node.durationMs - overflowMs),
            overtimeMs: 0,
            totalElapsedMs,
            segmentStartElapsedMs: totalElapsedMs,
          });
        }
      }
      return;
    }

    // Still counting down — check warning threshold
    const warningAtMs = seg.node.warningAtMs;
    const newSegmentState: SegmentState = newRemaining <= warningAtMs ? "warning" : "running";

    // Emit warning when crossing the threshold
    if (segmentState !== "warning" && newSegmentState === "warning") {
      this.emit("warning");
    }

    this.mutate({
      remainingMs: newRemaining,
      segmentState: newSegmentState,
      totalElapsedMs,
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private mutate(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
  }
}
