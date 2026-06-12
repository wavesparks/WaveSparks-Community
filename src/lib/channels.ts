import type { PostType } from "@/lib/domain";

export interface CommunityChannel {
  id: string;
  label: string;
  description: string;
  href: string;
}

function feedChannel(
  slug: string,
  input: { id: string; label: string; description: string; tag?: string; type?: PostType },
) {
  const params = new URLSearchParams();
  if (input.tag) {
    params.set("tag", input.tag);
  }
  if (input.type) {
    params.set("type", input.type);
  }

  const query = params.toString();
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    href: `/org/${slug}/feed${query ? `?${query}` : ""}`,
  } satisfies CommunityChannel;
}

export function getCommunityChannels(slug: string): CommunityChannel[] {
  return [
    feedChannel(slug, {
      id: "fundraising",
      label: "Fundraising",
      description: "Investor, pricing, and capital questions.",
      tag: "fundraising",
    }),
    feedChannel(slug, {
      id: "hiring",
      label: "Hiring",
      description: "Roles, referrals, and team design.",
      tag: "hiring",
    }),
    feedChannel(slug, {
      id: "product",
      label: "Product",
      description: "Validation, design, and product judgment.",
      tag: "product",
    }),
    feedChannel(slug, {
      id: "growth",
      label: "Growth",
      description: "Sales, GTM, and distribution loops.",
      tag: "GTM",
    }),
    feedChannel(slug, {
      id: "ai",
      label: "AI",
      description: "Applied AI products and trust questions.",
      tag: "AI",
    }),
    feedChannel(slug, {
      id: "climate",
      label: "Climate",
      description: "Climate, resilience, and industrial systems.",
      tag: "climate",
    }),
    feedChannel(slug, {
      id: "cofounder",
      label: "Cofounder",
      description: "Founder fit and cofounder searches.",
      type: "looking_for_cofounder",
    }),
    feedChannel(slug, {
      id: "mentors",
      label: "Mentors",
      description: "Mentor asks and operator guidance.",
      type: "looking_for_mentor",
    }),
    {
      id: "resources",
      label: "Resources",
      description: "Reusable advice and frameworks.",
      href: `/org/${slug}/knowledge`,
    },
  ];
}
