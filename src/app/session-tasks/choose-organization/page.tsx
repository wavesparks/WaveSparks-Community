import { TaskChooseOrganization } from "@clerk/nextjs";

import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { isClerkConfigured } from "@/lib/env";

export default function ChooseOrganizationTaskPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="ws-page-shell grid min-h-screen place-items-center px-4 py-8">
        <Card className="max-w-lg space-y-4">
          <SectionHeading
            eyebrow="Account setup"
            level={1}
            title="Account setup is temporarily unavailable"
            description="Please try again later or contact the Wavesparks team."
          />
          <LinkButton href="/org/wavesparks">Back to home</LinkButton>
        </Card>
      </main>
    );
  }

  return <TaskChooseOrganization redirectUrlComplete="/org/wavesparks/auth/complete" />;
}
