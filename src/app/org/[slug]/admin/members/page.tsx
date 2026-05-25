import { createManagedAccountAction, updateMembershipAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getUserById, listMembershipsForOrg, getProfileByMembershipId } from "@/server/store";

export default async function AdminMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const memberships = await listMembershipsForOrg(viewer.org.id);
  const memberCards = await Promise.all(
    memberships.map(async (membership) => ({
      membership,
      user: await getUserById(membership.userId),
      profile: await getProfileByMembershipId(membership.id),
    })),
  );

  return (
    <AppShell currentPath={`/org/${slug}/admin/members`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Members"
          title="Accounts and membership states"
          description="Create built-in accounts, approve members, and control who can reach admin surfaces."
        />
        <Card className="space-y-5">
          <SectionHeading eyebrow="Built-in account" title="Create or update an account" />
          <form
            action={createManagedAccountAction.bind(null, slug)}
            className="grid gap-4 lg:grid-cols-2"
          >
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Member name" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" placeholder="member@company.com" required type="email" />
            </div>
            <div>
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" minLength={8} name="password" required type="password" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="role">Role</Label>
                <Select defaultValue="member" id="role" name="role">
                  <option value="member">Member</option>
                  <option value="org_admin">Org admin</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select defaultValue="approved" id="status" name="status">
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="waitlist">Waitlist</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>
            </div>
            <div className="lg:col-span-2">
              <Button type="submit">Save account</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-6">
          {memberCards.map(({ membership, profile, user }) => {
            return (
              <Card className="space-y-4" key={membership.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">
                      {user?.name ?? membership.id}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {membership.affiliationType} · {membership.programName} · {membership.cohortNameOrYear}
                    </p>
                  </div>
                  <Badge variant={membership.status === "approved" ? "accent" : "default"}>
                    {membership.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-700">
                  {profile?.headline ?? "No profile headline yet."}
                </p>
                <form
                  action={updateMembershipAction.bind(null, slug, membership.id)}
                  className="grid gap-3 md:grid-cols-[180px_1fr_auto]"
                >
                  <select
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm"
                    defaultValue={membership.status}
                    name="status"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="waitlist">Waitlist</option>
                    <option value="rejected">Rejected</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  <Input defaultValue={membership.approvalNote ?? ""} name="approval_note" placeholder="Admin note" />
                  <Button type="submit">Save</Button>
                </form>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
