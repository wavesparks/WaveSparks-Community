import { describe, expect, it } from "vitest";

import {
  getAccountStatusLabel,
  getAffiliationLabel,
  getMembershipRoleLabel,
  getSpaceAccessStatusLabel,
} from "@/lib/member-copy";

describe("member-facing labels", () => {
  it("never exposes internal account or affiliation values", () => {
    expect(getAffiliationLabel("current participant")).toBe("Participant");
    expect(getAffiliationLabel("invited outsider")).toBe("Guest");
    expect(getAccountStatusLabel("suspended")).toBe("Paused");
    expect(getAccountStatusLabel("deprovisioned")).toBe("Account closed");
  });

  it("uses clear admin role and access labels", () => {
    expect(getMembershipRoleLabel("org_admin")).toBe("Administrator");
    expect(getSpaceAccessStatusLabel("waitlist")).toBe("Awaiting approval");
    expect(getSpaceAccessStatusLabel("rejected")).toBe("Not approved");
  });
});
