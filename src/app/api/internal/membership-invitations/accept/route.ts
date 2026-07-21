import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import {
  hashMembershipInvitationToken,
  isValidMembershipInvitationToken,
  membershipInvitationCookieMaxAgeSeconds,
  membershipInvitationCookieName,
  parseMembershipInvitationCookie,
  serializeMembershipInvitationCookie,
} from "@/lib/membership-invitation-token";
import {
  acceptMembershipInvitation,
  getMembershipInvitationByTokenHash,
  getOrganizationBySlug,
} from "@/server/store";

const orgSlugPattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
type ClerkInvitationHandoff = {
  status?: "sign_in" | "sign_up";
  ticket: string;
};

function safeOrgSlug(value?: string | null) {
  const slug = value?.trim() ?? "";
  return orgSlugPattern.test(slug) ? slug : null;
}

function clerkInvitationHandoff(request: NextRequest): ClerkInvitationHandoff | undefined {
  const status = request.nextUrl.searchParams.get("__clerk_status");
  const ticket = request.nextUrl.searchParams.get("__clerk_ticket")?.trim() ?? "";
  if (!ticket || ticket.length > 4096 || /\s/.test(ticket)) {
    return undefined;
  }
  return {
    ticket,
    ...(status === "sign_in" || status === "sign_up" ? { status } : {}),
  };
}

function cleanInvitationUrl(
  request: NextRequest,
  slug: string,
  state?: string,
  handoff?: ClerkInvitationHandoff,
) {
  const target = new URL(
    `/org/${encodeURIComponent(slug)}/accept-invitation`,
    request.url,
  );
  if (state) {
    target.searchParams.set("state", state);
  }
  if (handoff) {
    if (handoff.status) {
      target.searchParams.set("__clerk_status", handoff.status);
    }
    target.searchParams.set("__clerk_ticket", handoff.ticket);
  }
  return target;
}

function redirectWithoutInvitationToken(
  request: NextRequest,
  slug: string,
  state?: string,
  handoff?: ClerkInvitationHandoff,
) {
  const response = NextResponse.redirect(
    cleanInvitationUrl(request, slug, state, handoff),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function invitationCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function clearInvitationCookie<T extends NextResponse>(response: T) {
  response.cookies.set(
    membershipInvitationCookieName,
    "",
    invitationCookieOptions(0),
  );
  return response;
}

function bearerToken(request: NextRequest) {
  const match = /^Bearer\s+(.+)$/i.exec(
    request.headers.get("authorization")?.trim() ?? "",
  );
  return match?.[1]?.trim() || undefined;
}

function clerkFailureLogMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { providerStatus: "unknown" };
  const rawStatus =
    "status" in error
      ? error.status
      : "statusCode" in error
        ? error.statusCode
        : undefined;
  const providerStatus = Number(rawStatus);
  return {
    providerStatus: Number.isFinite(providerStatus) ? providerStatus : "unknown",
  };
}

function verifiedEmailFromClerkUser(
  user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>,
  invitationEmail: string,
) {
  const normalizedInvitationEmail = invitationEmail.trim().toLowerCase();
  const verified = user.emailAddresses.filter(
    (address) => address.verification?.status === "verified",
  );
  const primary = verified.find(
    (address) => address.id === user.primaryEmailAddressId,
  );

  if (primary?.emailAddress.trim().toLowerCase() === normalizedInvitationEmail) {
    return primary.emailAddress;
  }

  return verified.find(
    (address) =>
      address.emailAddress.trim().toLowerCase() === normalizedInvitationEmail,
  )?.emailAddress;
}

export async function GET(request: NextRequest) {
  const slug = safeOrgSlug(request.nextUrl.searchParams.get("orgSlug"));
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const fallbackSlug = slug ?? "wavesparks";
  const handoff = clerkInvitationHandoff(request);

  if (!slug || !isValidMembershipInvitationToken(token)) {
    return clearInvitationCookie(
      redirectWithoutInvitationToken(request, fallbackSlug, "invalid"),
    );
  }

  const [org, invitation] = await Promise.all([
    getOrganizationBySlug(slug),
    getMembershipInvitationByTokenHash(hashMembershipInvitationToken(token!)),
  ]);
  if (!org || !invitation || invitation.orgId !== org.id) {
    return clearInvitationCookie(
      redirectWithoutInvitationToken(request, fallbackSlug, "invalid"),
    );
  }

  if (
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date().toISOString()
  ) {
    const state = invitation.status === "expired" ||
      invitation.expiresAt <= new Date().toISOString()
      ? "expired"
      : "inactive";
    return clearInvitationCookie(
      redirectWithoutInvitationToken(request, slug, state),
    );
  }

  const response = redirectWithoutInvitationToken(request, slug, undefined, handoff);
  response.cookies.set(
    membershipInvitationCookieName,
    serializeMembershipInvitationCookie({ orgSlug: slug, token: token! }),
    invitationCookieOptions(membershipInvitationCookieMaxAgeSeconds),
  );
  return response;
}

export async function POST(request: NextRequest) {
  const requestedSlug = safeOrgSlug(
    request.nextUrl.searchParams.get("orgSlug"),
  );
  const cookieValue = parseMembershipInvitationCookie(
    request.cookies.get(membershipInvitationCookieName)?.value,
  );

  if (!cookieValue) {
    return new NextResponse(null, {
      headers: { "Cache-Control": "no-store" },
      status: 204,
    });
  }

  if (requestedSlug && requestedSlug !== cookieValue.orgSlug) {
    return clearInvitationCookie(
      NextResponse.json(
        { error: "Invitation organization mismatch." },
        { status: 400 },
      ),
    );
  }

  const tokenHash = hashMembershipInvitationToken(cookieValue.token);
  const [org, invitation, identity] = await Promise.all([
    getOrganizationBySlug(cookieValue.orgSlug),
    getMembershipInvitationByTokenHash(tokenHash),
    getCurrentAuthIdentity({
      allowClerkLookupWithoutCookie: true,
      clerkSessionToken: bearerToken(request),
    }),
  ]);

  if (!identity) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!org || !invitation || invitation.orgId !== org.id) {
    return clearInvitationCookie(
      NextResponse.json(
        { error: "Invitation is no longer active." },
        { status: 410 },
      ),
    );
  }

  let verifiedEmail: string | undefined;
  if (identity.provider === "e2e") {
    verifiedEmail = identity.email;
  } else {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(identity.clerkUserId);
      verifiedEmail = verifiedEmailFromClerkUser(clerkUser, invitation.email);
    } catch (error) {
      console.error(
        "[wavesparks] Failed to verify invitation email with Clerk",
        clerkFailureLogMetadata(error),
      );
      return NextResponse.json(
        { error: "Unable to verify this account right now." },
        { status: 503 },
      );
    }
  }

  if (!verifiedEmail) {
    return NextResponse.json(
      { error: "Invitation email does not match this account." },
      { status: 403 },
    );
  }

  const result = await acceptMembershipInvitation({
    clerkUserId: identity.clerkUserId,
    orgId: org.id,
    tokenHash,
    verifiedEmail,
  });

  if (!result.ok) {
    if (result.reason === "email_mismatch") {
      return NextResponse.json(
        { error: "Invitation email does not match this account." },
        { status: 403 },
      );
    }
    if (
      result.reason === "identity_conflict" ||
      result.reason === "membership_unavailable"
    ) {
      return NextResponse.json(
        { error: "Invitation could not be connected to this account." },
        { status: 409 },
      );
    }
    return clearInvitationCookie(
      NextResponse.json(
        { error: "Invitation is no longer active." },
        { status: 410 },
      ),
    );
  }

  return clearInvitationCookie(
    NextResponse.json({
      ok: true,
      target: `/org/${cookieValue.orgSlug}`,
    }),
  );
}
