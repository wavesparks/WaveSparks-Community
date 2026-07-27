import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/admin", () => ({
  createManagedAccountAction: vi.fn(),
  resendMembershipInvitationAction: vi.fn(),
  revokeMembershipInvitationAction: vi.fn(),
  updateMemberSpaceAccessAction: vi.fn(),
  updateMembershipAction: vi.fn(),
  updateMentorDesignationAction: vi.fn(),
}));

import { InviteOnePersonForm } from "@/components/admin/invite-one-person-form";
import { MemberDetailPanel } from "@/components/admin/member-detail-panel";

afterEach(() => cleanup());

const spaces = [
  {
    id: "spc_main",
    kind: "main" as const,
    lifecycle: "active",
    name: "Wavesparks Community",
  },
];

describe("admin mentor management", () => {
  it("keeps account permissions and mentor designation separate when inviting", async () => {
    const user = userEvent.setup();
    render(
      <InviteOnePersonForm
        defaultAccessStatus="active"
        defaultDestinationSpaceId="spc_main"
        slug="wavesparks"
        spaces={spaces}
      />,
    );

    const permissions = screen.getByLabelText("Account permissions");
    const designation = screen.getByLabelText("Mentor designation");
    expect(permissions).toHaveValue("member");
    expect(designation).toHaveValue("not_mentor");

    await user.selectOptions(designation, "approved");

    expect(permissions).toHaveValue("member");
    expect(designation).toHaveValue("approved");
    expect(screen.getByText(/can publish mentor details/i)).toBeInTheDocument();
  });

  it("shows explicit approve and reject controls for a pending mentor review", () => {
    render(
      <MemberDetailPanel
        member={{ email: "mentor@example.com", name: "Pending Mentor" }}
        membership={{
          accountStatus: "connected",
          id: "mem_mentor",
          mentorStatus: "needs_review",
          role: "member",
        }}
        slug="wavesparks"
        spaces={spaces}
      />,
    );

    expect(screen.getByLabelText("Account permissions")).toHaveValue("member");
    expect(screen.getByLabelText("Mentor designation")).toHaveValue("needs_review");
    expect(screen.getByRole("button", { name: "Approve mentor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
