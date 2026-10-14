import type { Command } from "../api";
import type { TargetRef } from "./types";
import { targetKey } from "./types";

export interface Change {
  power?: boolean;
  colour?: { hue: number; sat: number };
  /** protocol brightness 3-1000 */
  brightness?: number;
  /** built-in effect number; replaces a pending color */
  effect?: number;
  /** effect speed 1-100 */
  speed?: number;
  /** effect direction */
  direction?: boolean;
}

type Send = (target: TargetRef, command: Command) => Promise<void>;

interface Pending {
  target: TargetRef;
  change: Change;
}

/**
 * Collapses a burst of UI changes (dragging the color wheel) into a few commands: per target
 * only the latest value of each kind survives, sent in the order power, color, brightness, at
 * most one flush every `delayMs`, and never two flushes at once.
 */
export class Sender {
  private pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly send: Send,
    private readonly delayMs = 150,
  ) {}

  queue(target: TargetRef, change: Change): void {
    const key = targetKey(target);
    const prev = this.pending.get(key)?.change ?? {};
    const merged = { ...prev, ...change };
    // a color and an effect replace each other: whichever was asked last wins
    if (change.effect !== undefined) merged.colour = undefined;
    if (change.colour) merged.effect = undefined;
    // if power is false, drop color and brightness for this target (only power is sent)
    if (merged.power === false) {
      merged.colour = undefined;
      merged.brightness = undefined;
      merged.effect = undefined;
      merged.speed = undefined;
      merged.direction = undefined;
    }
    this.pending.set(key, { target, change: merged });
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.delayMs);
    }
  }

  /** Sends everything queued now (used on pointer-up) and resolves when it is on the wire. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = [...this.pending.values()];
    this.pending.clear();
    this.running = this.running.then(async () => {
      for (const { target, change } of batch) {
        if (change.power !== undefined) {
          await this.send(target, { type: "power", value: change.power });
        }
        if (change.colour) {
          await this.send(target, { type: "color", value: change.colour });
        }
        if (change.effect !== undefined) {
          await this.send(target, { type: "effect", value: change.effect });
        }
        if (change.speed !== undefined) {
          await this.send(target, { type: "speed", value: change.speed });
        }
        if (change.direction !== undefined) {
          await this.send(target, { type: "direction", value: change.direction });
        }
        if (change.brightness !== undefined) {
          await this.send(target, { type: "brightness", value: change.brightness });
        }
      }
    });
    return this.running;
  }
}
