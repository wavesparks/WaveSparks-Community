import { TaskChooseOrganization } from "@clerk/nextjs";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { isClerkConfigured } from "@/lib/env";

export default function ChooseOrganizationTaskPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="ws-page-shell grid min-h-screen place-items-center px-4 py-8">
        <Card className="max-w-lg space-y-4">
          <SectionHeading
            eyebrow="Configuration"
            level={1}
            title="Clerk is not configured"
            description="Organization selection is available after Clerk keys are configured."
          />
          <Button asChild>
            <Link href="/org/wavespark/feed">Back to forum</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return <TaskChooseOrganization redirectUrlComplete="/org/wavespark/onboarding" />;
}
