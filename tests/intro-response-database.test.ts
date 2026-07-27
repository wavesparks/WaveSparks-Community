// @vitest-environment node

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  where: undefined as unknown,
  returning: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      databaseUrl: "postgres://wavesparks:test@localhost:5432/wavesparks",
    },
  };
});

vi.mock("@/db/client", () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: (condition: unknown) => {
          databaseMock.where = condition;
          return { returning: databaseMock.returning };
        },
      }),
    }),
  }),
  getTransactionDb: vi.fn(),
}));

import { respondToIntroRequestInSpace } from "@/server/store";

describe("database intro response state transition", () => {
  beforeEach(() => {
    databaseMock.where = undefined;
    databaseMock.returning.mockReset().mockResolvedValue([]);
  });

  it("claims only a pending request in the owning Space and returns null on conflict", async () => {
    await expect(
      respondToIntroRequestInSpace(
        "spc_intro_owner",
        "intro_pending_claim",
        "accepted",
        { recordAnalytics: false },
      ),
    ).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(databaseMock.where as SQL);
    expect(query.sql).toBe(
      '("intro_requests"."id" = $1 and "intro_requests"."status" = $2 and "intro_requests"."space_id" = $3)',
    );
    expect(query.params).toEqual([
      "intro_pending_claim",
      "pending",
      "spc_intro_owner",
    ]);
  });
});
