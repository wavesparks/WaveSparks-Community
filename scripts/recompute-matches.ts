import { recomputeMatchesForOrg } from "@/server/store";

async function main() {
  const matches = recomputeMatchesForOrg("org_wavespark");
  console.info(`Recomputed ${matches.length} matches for Wavespark.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
