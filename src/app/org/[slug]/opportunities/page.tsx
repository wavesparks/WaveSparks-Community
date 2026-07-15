import { redirect } from "next/navigation";

import { pathWithQuery } from "@/lib/feed-filters";
import { getLegacySpaceDestination } from "@/lib/space-auth";

export default async function LegacyOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const destination = await getLegacySpaceDestination(slug, "opportunities");
  redirect(pathWithQuery(destination, query));
}
