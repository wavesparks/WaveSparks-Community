import { NextResponse } from "next/server";

import {
  createE2ELocalAuthToken,
  e2eLocalAuthCookieName,
  e2eLocalAuthHeaderName,
  e2eLocalAuthSecretMatches,
  isE2ELocalAuthEnabled,
  isE2ELocalRequest,
} from "@/lib/e2e-local-auth";

function unavailable() {
  return new Response("Not found", { status: 404 });
}

function unauthorized() {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

export async function POST(request: Request) {
  if (!isE2ELocalAuthEnabled() || !isE2ELocalRequest(request)) {
    return unavailable();
  }

  if (!e2eLocalAuthSecretMatches(request.headers.get(e2eLocalAuthHeaderName))) {
    return unauthorized();
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    imageUrl?: string;
    name?: string;
    orgId?: string;
    orgRole?: string;
    orgSlug?: string;
  };
  const email = body.email?.toLowerCase().trim();
  if (!email?.includes("@")) {
    return Response.json({ error: "A valid email is required." }, { status: 400 });
  }

  const token = createE2ELocalAuthToken({
    email,
    imageUrl: body.imageUrl,
    name: body.name?.trim() || email,
    orgId: body.orgId?.trim() || "org_e2e_wavespark",
    orgRole: body.orgRole?.trim() || "org:member",
    orgSlug: body.orgSlug?.trim() || "wavespark",
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(e2eLocalAuthCookieName, token, {
    httpOnly: true,
    maxAge: 3600,
    path: "/",
    sameSite: "lax",
    secure: false,
  });
  return response;
}

export async function DELETE(request: Request) {
  if (!isE2ELocalAuthEnabled() || !isE2ELocalRequest(request)) {
    return unavailable();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(e2eLocalAuthCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: false,
  });
  return response;
}
