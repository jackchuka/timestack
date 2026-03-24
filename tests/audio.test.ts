import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioManager } from "../src/audio";

const mockOscillator = {
  type: "sine",
  frequency: { setValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockGain = {
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
};

const mockContext = {
  createOscillator: vi.fn(() => ({ ...mockOscillator })),
  createGain: vi.fn(() => ({ ...mockGain })),
  destination: {},
  currentTime: 0,
  resume: vi.fn(),
  state: "suspended",
};

describe("AudioManager", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return mockContext;
      }),
    );
    mockContext.createOscillator.mockClear();
    mockContext.createGain.mockClear();
    mockContext.resume.mockClear();
    (AudioContext as any).mockClear();
  });

  it("creates AudioContext on init", () => {
    const audio = new AudioManager();
    audio.init();
    expect(AudioContext).toHaveBeenCalled();
  });

  it("resumes suspended context before playing", () => {
    const audio = new AudioManager();
    audio.init();
    audio.setMuted(false);
    audio.playWarning();
    expect(mockContext.resume).toHaveBeenCalled();
  });

  it("does not play when muted", () => {
    const audio = new AudioManager();
    audio.init();
    audio.setMuted(true);
    audio.playWarning();
    expect(mockContext.createOscillator).not.toHaveBeenCalled();
  });

  it("plays warning sound when not muted", () => {
    const audio = new AudioManager();
    audio.init();
    audio.setMuted(false);
    audio.playWarning();
    expect(mockContext.createOscillator).toHaveBeenCalled();
  });

  it("does not create multiple AudioContexts on repeated init", () => {
    const audio = new AudioManager();
    audio.init();
    audio.init();
    expect(AudioContext).toHaveBeenCalledTimes(1);
  });
});
