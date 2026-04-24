import { updateMembershipAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    requireCompleteProfile: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const memberships = listMembershipsForOrg(viewer.org.id);

  return (
    <AppShell currentPath={`/org/${slug}/admin/members`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Members"
          title="Approval queue and membership states"
          description="Approve, waitlist, suspend, and annotate members without exposing the full org to regular users."
        />
        <div className="space-y-6">
          {memberships.map((membership) => {
            const user = getUserById(membership.userId);
            const profile = getProfileByMembershipId(membership.id);
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
