import { describe, expect, it, vi } from "vitest";

import {
  createSpaceRecomputeLock,
  SPACE_RECOMPUTE_IDLE_TRANSACTION_TIMEOUT,
  type SpaceLockSessionProvider,
  type SpaceLockSql,
  withSpaceAdvisoryLock,
} from "@/server/space-recompute-lock";

function fakeSession(options: { unlocks?: boolean } = {}) {
  const events: string[] = [];
  const session = (async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("pg_advisory_unlock")) {
      events.push("unlock");
      return [{ unlocked: options.unlocks ?? true }];
    }
    events.push("lock");
    return [{}];
  }) as unknown as SpaceLockSql;
  return { events, session };
}

function provider(session: SpaceLockSql, events: string[]): SpaceLockSessionProvider {
  return {
    async run<T>(operation: (activeSession: SpaceLockSql) => Promise<T>) {
      events.push("session:start");
      try {
        return await operation(session);
      } finally {
        events.push("session:end");
      }
    },
  };
}

describe("Space recompute locking", () => {
  it("keeps the dedicated advisory-lock transaction alive for the full callback", () => {
    expect(SPACE_RECOMPUTE_IDLE_TRANSACTION_TIMEOUT).toBe("0");
  });

  it("releases the advisory lock when protected work throws", async () => {
    const { events, session } = fakeSession();

    await expect(
      withSpaceAdvisoryLock(session, "space-a", async () => {
        events.push("work");
        throw new Error("recompute failed");
      }),
    ).rejects.toThrow("recompute failed");
    expect(events).toEqual(["lock", "work", "unlock"]);
  });

  it("fails closed when PostgreSQL reports that the lock was not released", async () => {
    const { session } = fakeSession({ unlocks: false });

    await expect(
      withSpaceAdvisoryLock(session, "space-a", async () => "done"),
    ).rejects.toThrow(/Failed to release/);
  });

  it("serializes the same Space, releases after failure, and lets other Spaces run", async () => {
    const { events: sqlEvents, session } = fakeSession();
    const lifecycle: string[] = [];
    const lock = createSpaceRecomputeLock(provider(session, lifecycle));
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock("space-a", async () => {
      lifecycle.push("a:first:start");
      await firstGate;
      lifecycle.push("a:first:throw");
      throw new Error("first failed");
    });
    const second = lock("space-a", async () => {
      lifecycle.push("a:second");
      return "second";
    });
    const other = lock("space-b", async () => {
      lifecycle.push("b:first");
      return "other";
    });

    await vi.waitFor(() => {
      expect(lifecycle).toContain("a:first:start");
      expect(lifecycle).toContain("b:first");
    });
    expect(lifecycle).not.toContain("a:second");
    releaseFirst();

    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("second");
    await expect(other).resolves.toBe("other");
    expect(lifecycle.indexOf("a:second")).toBeGreaterThan(
      lifecycle.indexOf("a:first:throw"),
    );
    expect(sqlEvents.filter((event) => event === "lock")).toHaveLength(3);
    expect(sqlEvents.filter((event) => event === "unlock")).toHaveLength(3);
  });

  it("reuses one session for nested same-Space locks and balances every lock", async () => {
    const { events: sqlEvents, session } = fakeSession();
    const lifecycle: string[] = [];
    const sessionProvider = provider(session, lifecycle);
    const runSpy = vi.spyOn(sessionProvider, "run");
    const lock = createSpaceRecomputeLock(sessionProvider);

    await lock("space-a", async (outerSession) => {
      expect(outerSession).toBe(session);
      await lock("space-a", async (innerSession) => {
        expect(innerSession).toBe(session);
      });
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(sqlEvents).toEqual(["lock", "lock", "unlock", "unlock"]);
    expect(lifecycle).toEqual(["session:start", "session:end"]);
  });
});
