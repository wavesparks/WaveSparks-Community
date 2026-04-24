import { respondIntroAction } from "@/actions/member";
import { IntroRequestCard } from "@/components/community/intro-request-card";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getIntroRequestViews, getNotificationViews } from "@/server/view-models";

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const requests = getIntroRequestViews(viewer.membership.id);
  const notifications = getNotificationViews(viewer.membership.id);

  return (
    <AppShell currentPath={`/org/${slug}/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Requests"
          title="Manage introductions and notifications"
          description="Accepted intros reveal contact details. Declines stay polite. Pending requests keep the context visible without forcing a directory."
        />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            {requests.map((request) => (
              <IntroRequestCard
                actions={
                  request.isIncoming && request.status === "pending" ? (
                    <div className="flex gap-3">
                      <form
                        action={respondIntroAction.bind(
                          null,
                          slug,
                          request.id,
                          viewer.membership.id,
                          "accepted",
                        )}
                      >
                        <Button type="submit">Accept</Button>
                      </form>
                      <form
                        action={respondIntroAction.bind(
                          null,
                          slug,
                          request.id,
                          viewer.membership.id,
                          "declined",
                        )}
                      >
                        <Button type="submit" variant="secondary">
                          Decline
                        </Button>
                      </form>
                    </div>
                  ) : null
                }
                key={request.id}
                request={request}
              />
            ))}
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionHeading eyebrow="Inbox" title="In-app notifications" />
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div className="rounded-[24px] bg-slate-50 p-4" key={notification.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{notification.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                      </div>
                      {!notification.readAt ? <Badge variant="accent">new</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
