import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth-options";
import { isClerkConfigured } from "@/lib/env";

function disabled() {
  return Response.json({ error: "Local auth fallback is disabled." }, { status: 404 });
}

const handler = isClerkConfigured() ? disabled : NextAuth(authOptions);

export const GET = handler;
export const POST = handler;
