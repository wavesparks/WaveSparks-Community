import { after } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import type { AnalyticsEvent, Notification } from "@/lib/domain";
import { sendNotificationEmail } from "@/server/notifications";
import {
  addAnalyticsEvent,
  addNotification,
  getProfileByMembershipId,
} from "@/server/store";

export function enqueueAnalyticsEvent(event: AnalyticsEvent) {
  after(async () => {
    try {
      await addAnalyticsEvent(event);
    } catch (error) {
      console.error("[wavesparks] analytics event failed", event.eventName, error);
    }
  });
}

export function enqueueNotificationWrite(notification: Notification) {
  after(async () => {
    try {
      await addNotification(notification);
    } catch (error) {
      console.error(
        "[wavesparks] notification write failed",
        notification.type,
        notification.membershipId,
        error,
      );
    }
  });
}

export function enqueueMembershipEmail(input: {
  membershipId: string;
  subject: string;
  html: string;
}) {
  after(async () => {
    try {
      const profile = await getProfileByMembershipId(input.membershipId);
      if (!profile?.emailForIntro) {
        return;
      }

      await sendNotificationEmail({
        to: profile.emailForIntro,
        subject: input.subject,
        html: input.html,
      });
    } catch (error) {
      console.error(
        "[wavesparks] member email failed",
        input.subject,
        input.membershipId,
        error,
      );
    }
  });
}

export function enqueueClerkInvitation(input: {
  emailAddress: string;
  redirectUrl: string;
  publicMetadata: Record<string, string>;
}) {
  after(async () => {
    try {
      const client = await clerkClient();
      await client.invitations.createInvitation({
        emailAddress: input.emailAddress,
        redirectUrl: input.redirectUrl,
        ignoreExisting: true,
        publicMetadata: input.publicMetadata,
      });
    } catch (error) {
      console.error(
        "[wavesparks] clerk invitation failed",
        input.emailAddress,
        error,
      );
    }
  });
}
