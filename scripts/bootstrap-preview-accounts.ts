import { chmod, writeFile } from "node:fs/promises";

import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

const credentialsPath = "/tmp/wavesparks-preview-accounts.txt";

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const { getSqlClient } = await import("@/db/client");
  const { env } = await import("@/lib/env");
  const { seedOrganization } = await import("@/data/seed-data");
  const { listMembershipsForOrg } = await import("@/server/store");
  const { previewAccountSpecs, provisionPreviewAccounts } = await import(
    "@/server/preview-accounts"
  );

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  console.info(
    `Preview-account target: ${target.environment} (${databaseTarget(env.databaseUrl)}).`,
  );
  if (!assertWriteAllowed(target)) {
    console.info("Dry run only. Re-run with --apply to provision the selected environment.");
    return;
  }

  const reviewer = (await listMembershipsForOrg(seedOrganization.id))
    .filter(
      (membership) =>
        membership.role === "org_admin" && membership.accountStatus === "connected",
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!reviewer) {
    throw new Error("A connected organization administrator is required to provision previews.");
  }
  const provisioned = await provisionPreviewAccounts({
    orgId: seedOrganization.id,
    reviewedByMembershipId: reviewer.id,
  });
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
      "Wavesparks preview accounts",
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

  await getSqlClient().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
