import { chmod, writeFile } from "node:fs/promises";

import { getSqlClient } from "@/db/client";
import { env } from "@/lib/env";
import {
  previewAccountSpecs,
  provisionPreviewAccounts,
} from "@/server/preview-accounts";

const credentialsPath = "/tmp/wavesparks-preview-accounts.txt";

async function main() {
  const provisioned = await provisionPreviewAccounts({});
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
      "",
      ...accountLines,
      "",
      "Authentication is managed by Clerk. Create or invite matching Clerk users for these emails to sign in.",
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
