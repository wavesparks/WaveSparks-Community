import { redirect } from "next/navigation";

import { pathWithQuery } from "@/lib/feed-filters";
import { getLegacySpaceDestination } from "@/lib/space-auth";

export default async function LegacyPersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, membershipId }, query] = await Promise.all([params, searchParams]);
  const destination = await getLegacySpaceDestination(
    slug,
    `people/${encodeURIComponent(membershipId)}`,
  );
  redirect(pathWithQuery(destination, query));
}
