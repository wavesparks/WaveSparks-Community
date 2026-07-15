import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadScriptEnv } from "../scripts/load-script-env";

const touchedKeys = [
  "SCRIPT_ENV_SHARED",
  "SCRIPT_ENV_ONLY_PRODUCTION",
  "SCRIPT_ENV_ONLY_LOCAL",
  "SCRIPT_ENV_EXISTING",
] as const;

function resetTouchedEnv() {
  for (const key of touchedKeys) {
    delete process.env[key];
  }
}

describe("loadScriptEnv", () => {
  afterEach(() => {
    resetTouchedEnv();
  });

  it("loads production env files with Next-style precedence", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wavesparks-env-"));

    try {
      writeFileSync(
        path.join(dir, ".env"),
        [
          "SCRIPT_ENV_SHARED=base",
          "SCRIPT_ENV_ONLY_LOCAL=base-local",
          "SCRIPT_ENV_EXISTING=from-file",
        ].join("\n"),
      );
      writeFileSync(
        path.join(dir, ".env.production.local"),
        [
          "SCRIPT_ENV_SHARED=production-local",
          "SCRIPT_ENV_ONLY_PRODUCTION=\"quoted value\"",
        ].join("\n"),
      );

      process.env.SCRIPT_ENV_EXISTING = "from-process";

      expect(loadScriptEnv("production", dir)).toEqual([
        ".env.production.local",
        ".env",
      ]);
      expect(process.env.SCRIPT_ENV_SHARED).toBe("production-local");
      expect(process.env.SCRIPT_ENV_ONLY_PRODUCTION).toBe("quoted value");
      expect(process.env.SCRIPT_ENV_ONLY_LOCAL).toBe("base-local");
      expect(process.env.SCRIPT_ENV_EXISTING).toBe("from-process");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
