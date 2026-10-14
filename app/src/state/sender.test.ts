import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../api";
import { Sender } from "./sender";
import type { TargetRef } from "./types";

const strip: TargetRef = { kind: "strip", id: "a" };
const group: TargetRef = { kind: "group", id: "g" };

describe("Sender", () => {
  const sent: Array<[TargetRef, Command]> = [];
  const send = vi.fn(async (t: TargetRef, c: Command) => {
    sent.push([t, c]);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    send.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("collapses a burst into the latest color", async () => {
    const s = new Sender(send, 150);
    for (let h = 0; h < 50; h++) s.queue(strip, { colour: { hue: h, sat: 1000 } });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toEqual([[strip, { type: "color", value: { hue: 49, sat: 1000 } }]]);
  });

  it("sends power, then color, then brightness for one target", async () => {
    const s = new Sender(send, 150);
    s.queue(strip, { brightness: 500 });
    s.queue(strip, { colour: { hue: 10, sat: 900 } });
    s.queue(strip, { power: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent.map(([, c]) => c.type)).toEqual(["power", "color", "brightness"]);
  });

  it("keeps targets independent", async () => {
    const s = new Sender(send, 150);
    s.queue(strip, { colour: { hue: 1, sat: 1 } });
    s.queue(group, { colour: { hue: 2, sat: 2 } });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(2);
    expect(sent.map(([t]) => t.kind).sort()).toEqual(["group", "strip"]);
  });

  it("flush sends immediately and cancels the timer", async () => {
    const s = new Sender(send, 150);
    s.queue(strip, { brightness: 700 });
    await s.flush();
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(1);
  });

  it("never runs two flushes at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 100));
      inFlight--;
    });
    const s = new Sender(slow, 10);
    s.queue(strip, { colour: { hue: 1, sat: 1 } });
    const a = s.flush();
    s.queue(strip, { colour: { hue: 2, sat: 2 } });
    const b = s.flush();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([a, b]);
    expect(maxInFlight).toBe(1);
    expect(slow).toHaveBeenCalledTimes(2);
  });

  it("sends the effect after the color slot, then speed and direction, then brightness", async () => {
    const s = new Sender(send, 150);
    s.queue(strip, { brightness: 500, direction: true, speed: 80, effect: 35, power: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent.map(([, c]) => c.type)).toEqual(["power", "effect", "speed", "direction", "brightness"]);
  });

  it("an effect and a color replace each other, last one asked wins", async () => {
    const s = new Sender(send, 150);
    s.queue(strip, { effect: 3 });
    s.queue(strip, { colour: { hue: 10, sat: 1000 } });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent.map(([, c]) => c.type)).toEqual(["color"]);

    sent.length = 0;
    s.queue(strip, { colour: { hue: 10, sat: 1000 } });
    s.queue(strip, { effect: 3 });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent.map(([, c]) => c.type)).toEqual(["effect"]);
  });
});
