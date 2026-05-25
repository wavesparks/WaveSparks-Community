import { createManualIntroAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { getUserById, listIntroRequestsForOrg, listMembershipsForOrg } from "@/server/store";

export default async function AdminRequestsPage({
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

  const requests = await listIntroRequestsForOrg(viewer.org.id);
  const members = (await listMembershipsForOrg(viewer.org.id)).filter(
    (membership) => membership.status === "approved",
  );
  const userById = new Map(
    await Promise.all(
      members.map(async (membership) => [
        membership.userId,
        await getUserById(membership.userId),
      ] as const),
    ),
  );

  return (
    <AppShell currentPath={`/org/${slug}/admin/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin - Requests"
          title="Watch intro flow and create manual intros"
          description="Manual intros let admins catalyze obvious fits without opening the member graph to everyone."
        />

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4">
            <SectionHeading title="Create manual intro" />
            <form
              action={createManualIntroAction.bind(null, slug, viewer.membership.id)}
              className="space-y-4"
            >
              <select className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm" name="receiver_membership_id">
                {members.map((membership) => {
                  const user = userById.get(membership.userId);
                  return (
                    <option key={membership.id} value={membership.id}>
                      {user?.name ?? membership.id}
                    </option>
                  );
                })}
              </select>
              <Input name="intro_purpose" placeholder="general connection / mentor guidance" />
              <Textarea
                name="note"
                placeholder="Why are you making this intro?"
                defaultValue="Admin-curated intro based on a strong fit and helpful overlap."
              />
              <Button className="w-full" type="submit">
                Send manual intro
              </Button>
            </form>
          </Card>

          <div className="space-y-4">
            {requests.map((request) => {
              const requester = members.find(
                (membership) => membership.id === request.requesterMembershipId,
              );
              const receiver = members.find(
                (membership) => membership.id === request.receiverMembershipId,
              );
              return (
                <Card className="space-y-3" key={request.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{request.introPurpose}</p>
                    <Badge variant={request.status === "accepted" ? "accent" : "default"}>
                      {request.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {userById.get(requester?.userId ?? "")?.name ?? "Unknown"} to{" "}
                    {userById.get(receiver?.userId ?? "")?.name ?? "Unknown"}
                  </p>
                  <p className="text-sm text-slate-700">{request.note}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
