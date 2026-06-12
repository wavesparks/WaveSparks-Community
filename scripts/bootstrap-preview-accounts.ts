import { chmod, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

import { getSqlClient } from "@/db/client";
import { env } from "@/lib/env";
import {
  previewAccountSpecs,
  provisionPreviewAccounts,
} from "@/server/preview-accounts";

const credentialsPath = "/tmp/wavesparks-preview-accounts.txt";

function previewPassword() {
  return process.env.WAVESPARK_PREVIEW_PASSWORD?.trim() || randomBytes(24).toString("base64url");
}

async function main() {
  const password = previewPassword();
  const provisioned = await provisionPreviewAccounts({ password });
  const accountLines = provisioned.map(({ spec, membership }) =>
    [
      `${spec.label}`,
      `role=${spec.kind}`,
      `email=${spec.email}`,
      `membership=${membership.id}`,
    ].join(" | "),
  );

  await writeFile(
    credentialsPath,
    [
      "Wavespark preview accounts",
      `Generated: ${new Date().toISOString()}`,
      `Password: ${password}`,
      "",
      ...accountLines,
      "",
      "Use the same password for all preview accounts.",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(credentialsPath, 0o600);

  console.info(`Preview accounts provisioned: ${previewAccountSpecs.length}`);
  console.info(`Credentials file: ${credentialsPath}`);

  if (env.databaseUrl) {
    await getSqlClient().end();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (env.databaseUrl) {
    await getSqlClient().end();
  }
  process.exit(1);
});
