import { beforeEach, describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import { seedOrganization } from "@/data/seed-data";
import { getOrganizationBySlug, getStore, resetStore } from "@/server/store";

describe("Wavesparks brand contract", () => {
  beforeEach(() => {
    resetStore();
  });

  it("uses the plural brand, organization slug, and email domain", () => {
    expect(seedOrganization).toMatchObject({
      name: "Wavesparks",
      slug: "wavesparks",
    });
    expect(seedOrganization.allowedDomains).toContain("wavesparks.co");
    expect(seedOrganization.allowedDomains).not.toContain("wavespark.co");
  });

  it("canonicalizes the legacy persisted organization during rollout", async () => {
    const organization = getStore().organizations.find(
      (candidate) => candidate.id === seedOrganization.id,
    );
    expect(organization).toBeDefined();
    Object.assign(organization!, {
      allowedDomains: ["wavespark.co", "yfs.community"],
      name: "Wavespark",
      slug: "wavespark",
    });

    await expect(getOrganizationBySlug("wavesparks")).resolves.toMatchObject({
      id: seedOrganization.id,
      name: "Wavesparks",
      slug: "wavesparks",
    });
    await expect(getOrganizationBySlug("wavespark")).resolves.toMatchObject({
      id: seedOrganization.id,
      name: "Wavesparks",
      slug: "wavesparks",
    });
  });

  it("permanently redirects legacy organization URLs", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/org/wavespark",
          destination: "/org/wavesparks",
          permanent: true,
        },
        {
          source: "/org/wavespark/:path*",
          destination: "/org/wavesparks/:path*",
          permanent: true,
        },
      ]),
    );
  });
});
