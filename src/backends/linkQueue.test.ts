/**
 * Tests for the link queue — the primitive that stops two config exchanges
 * sharing the ATT link.
 *
 * The property that matters is not "the calls complete", it is "no two of them
 * are ever open at the same time". A queue that ran everything concurrently
 * would pass a test that only checked return values, and would still lose a
 * chunked save on real hardware, so overlap is what these assert: each fake
 * operation records an enter/exit event, and the transcript is checked for a
 * second `enter` before the matching `exit`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { onLink, linkBusy, linkPending, resetLinkQueue } from "./linkQueue";

/** A deferred, so a test can decide exactly when an operation finishes. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (and any pending timers-free awaits) settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * True if `log` ever has two operations open at once — i.e. an `enter` arrives
 * while a previous `enter` has no `exit` yet.
 */
function hasOverlap(log: string[]): boolean {
  let open = 0;
  for (const e of log) {
    if (e.startsWith("enter")) {
      open++;
      if (open > 1) return true;
    } else {
      open--;
    }
  }
  return false;
}

beforeEach(() => {
  resetLinkQueue();
});

describe("onLink", () => {
  it("never lets two operations overlap, even when all are started at once", async () => {
    const log: string[] = [];
    const op = (name: string, steps: number) => async () => {
      log.push(`enter ${name}`);
      // Several awaits inside one operation: this is what a chunked write
      // looks like, and the whole of it has to be one turn.
      for (let i = 0; i < steps; i++) await tick();
      log.push(`exit ${name}`);
      return name;
    };

    const results = await Promise.all([
      onLink(op("a", 3)),
      onLink(op("b", 1)),
      onLink(op("c", 2)),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(hasOverlap(log)).toBe(false);
    // FIFO: queued in call order, not in order of how quickly each finishes.
    expect(log).toEqual([
      "enter a",
      "exit a",
      "enter b",
      "exit b",
      "enter c",
      "exit c",
    ]);
  });

  it("holds a read back until a multi-chunk write has sent its last chunk", async () => {
    // The reported regression in miniature: five chunks out, and a background
    // read issued after chunk one. Before the queue it landed between chunks.
    const sent: string[] = [];
    const gate = deferred();

    const write = onLink(async () => {
      for (let n = 1; n <= 5; n++) {
        sent.push(`chunk ${n}`);
        if (n === 1) gate.resolve();
        await tick();
      }
    });

    await gate.promise;
    const read = onLink(async () => {
      sent.push("read");
      return new Uint8Array([1]);
    });

    await Promise.all([write, read]);
    expect(sent).toEqual([
      "chunk 1",
      "chunk 2",
      "chunk 3",
      "chunk 4",
      "chunk 5",
      "read",
    ]);
  });

  it("passes a rejection to its own caller and no one else's", async () => {
    // A failed save must not take the next panel's read down with it, and must
    // not leave the chain permanently broken.
    const boom = new Error("write failed");
    const failing = onLink(async () => {
      throw boom;
    });
    const after = onLink(async () => "ok");

    await expect(failing).rejects.toBe(boom);
    await expect(after).resolves.toBe("ok");
  });

  it("still runs the next operation after one rejects", async () => {
    const log: string[] = [];
    const a = onLink(async () => {
      log.push("enter a");
      await tick();
      log.push("exit a");
      throw new Error("nope");
    });
    const b = onLink(async () => {
      log.push("enter b");
      return 1;
    });

    await expect(a).rejects.toThrow("nope");
    await expect(b).resolves.toBe(1);
    expect(log).toEqual(["enter a", "exit a", "enter b"]);
  });

  it("surfaces a synchronous throw as a rejection without stalling the queue", async () => {
    const bad = onLink((() => {
      throw new Error("sync");
    }) as unknown as () => Promise<never>);

    await expect(bad).rejects.toThrow("sync");
    await expect(onLink(async () => "next")).resolves.toBe("next");
  });
});

describe("linkBusy", () => {
  it("is false when nothing is queued and true while an operation is open", async () => {
    expect(linkBusy()).toBe(false);

    const gate = deferred();
    const running = onLink(() => gate.promise);
    expect(linkBusy()).toBe(true);
    expect(linkPending()).toBe(1);

    onLink(async () => undefined);
    expect(linkPending()).toBe(2);

    gate.resolve();
    await running;
    await tick();
    expect(linkBusy()).toBe(false);
    expect(linkPending()).toBe(0);
  });

  it("goes back to false after an operation rejects", async () => {
    await expect(
      onLink(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    await tick();
    expect(linkBusy()).toBe(false);
  });
});

describe("resetLinkQueue", () => {
  it("lets a new connection start without waiting on the old link", async () => {
    // The case this exists for: an operation issued to a keyboard that is now
    // gone may never settle, and the next connection must not queue behind it.
    const stuck = deferred();
    const orphan = onLink(() => stuck.promise);
    expect(linkBusy()).toBe(true);

    resetLinkQueue();
    expect(linkBusy()).toBe(false);

    // Runs immediately despite `orphan` still being outstanding.
    await expect(onLink(async () => "fresh")).resolves.toBe("fresh");

    // And when the straggler finally settles it must not push the counter
    // negative — a `linkBusy()` of "false because -1" would be a lie that
    // survives every later check.
    stuck.resolve();
    await orphan;
    await tick();
    expect(linkPending()).toBe(0);
    expect(linkBusy()).toBe(false);
  });

  it("does not reject anything already in flight", async () => {
    const gate = deferred<string>();
    const inflight = onLink(() => gate.promise);
    resetLinkQueue();
    gate.resolve("still mine");
    await expect(inflight).resolves.toBe("still mine");
  });
});
