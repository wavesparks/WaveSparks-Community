import { AsyncLocalStorage } from "node:async_hooks";

import { createDedicatedSqlClient } from "@/db/client";
import { env } from "@/lib/env";

export const SPACE_RECOMPUTE_LOCK_NAMESPACE = "wavesparks:match-recompute:v1";
export const SPACE_RECOMPUTE_IDLE_TRANSACTION_TIMEOUT = "0";

export type SpaceLockSql = {
  <T extends readonly (object | undefined)[] = Array<Record<string, unknown>>>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): PromiseLike<T>;
};

export interface SpaceLockSessionProvider {
  run<T>(operation: (session: SpaceLockSql) => Promise<T>): Promise<T>;
}

function advisoryKey(spaceId: string) {
  return `${SPACE_RECOMPUTE_LOCK_NAMESPACE}:${spaceId}`;
}

export async function withSpaceAdvisoryLock<T>(
  session: SpaceLockSql,
  spaceId: string,
  operation: () => Promise<T>,
) {
  const key = advisoryKey(spaceId);
  await session`SELECT pg_advisory_lock(hashtextextended(${key}, 0))`;
  try {
    return await operation();
  } finally {
    const [result] = await session<Array<{ unlocked: boolean }>>`
      SELECT pg_advisory_unlock(hashtextextended(${key}, 0)) AS unlocked
    `;
    if (!result?.unlocked) {
      throw new Error(`Failed to release the match recompute lock for Space ${spaceId}.`);
    }
  }
}

export function createPostgresSpaceLockSessionProvider(): SpaceLockSessionProvider {
  return {
    async run<T>(operation: (session: SpaceLockSql) => Promise<T>) {
      const client = createDedicatedSqlClient();
      try {
        // Keeping an explicit transaction open pins pooled Postgres URLs to one
        // backend session for the complete session-level advisory lock lifetime.
        // The protected recompute uses other connections, so this transaction is
        // intentionally idle while work runs and must not expire before the callback.
        return (await client.begin(async (session) => {
          await session.unsafe(
            `SET LOCAL idle_in_transaction_session_timeout = '${SPACE_RECOMPUTE_IDLE_TRANSACTION_TIMEOUT}'`,
          );
          return operation(session as unknown as SpaceLockSql);
        })) as T;
      } finally {
        await client.end();
      }
    },
  };
}

export type WithSpaceRecomputeLock = <T>(
  spaceId: string,
  operation: (session: SpaceLockSql | undefined) => Promise<T>,
) => Promise<T>;

export function createSpaceRecomputeLock(
  sessionProvider?: SpaceLockSessionProvider,
): WithSpaceRecomputeLock {
  const mutexTails = new Map<string, Promise<void>>();
  const heldLocks = new AsyncLocalStorage<Map<string, SpaceLockSql | undefined>>();

  async function withMutex<T>(spaceId: string, operation: () => Promise<T>) {
    const previous = mutexTails.get(spaceId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    mutexTails.set(spaceId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (mutexTails.get(spaceId) === tail) {
        mutexTails.delete(spaceId);
      }
    }
  }

  return async function withSpaceRecomputeLock<T>(
    spaceId: string,
    operation: (session: SpaceLockSql | undefined) => Promise<T>,
  ): Promise<T> {
    const activeLocks = heldLocks.getStore();
    if (activeLocks?.has(spaceId)) {
      const session = activeLocks.get(spaceId);
      return session
        ? withSpaceAdvisoryLock(session, spaceId, () => operation(session))
        : operation(undefined);
    }

    return withMutex(spaceId, async () => {
      const runWithContext = (session: SpaceLockSql | undefined) => {
        const nextLocks = new Map(activeLocks);
        nextLocks.set(spaceId, session);
        return heldLocks.run(nextLocks, () => operation(session));
      };

      if (!sessionProvider) {
        return runWithContext(undefined);
      }
      return sessionProvider.run((session) =>
        withSpaceAdvisoryLock(session, spaceId, () => runWithContext(session)),
      );
    });
  };
}

export const withSpaceRecomputeLock = createSpaceRecomputeLock(
  env.databaseUrl ? createPostgresSpaceLockSessionProvider() : undefined,
);
