import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";

const clerkKeysConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);
const clerkFrontendApiProxyConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PROXY_URL,
);

const publicFeedPathPattern = /^\/org\/[^/]+\/feed\/?$/;
const publicReadPathPattern = /^\/org\/[^/]+\/(?:feed|posts\/[^/]+)\/?$/;

function isAnonymousPublicReadRequest(request: NextRequest) {
  return (
    publicReadPathPattern.test(request.nextUrl.pathname) &&
    !hasPotentialClerkSessionCookie(request.cookies.getAll())
  );
}

function anonymousFeedRewrite(request: NextRequest) {
  if (!publicFeedPathPattern.test(request.nextUrl.pathname)) {
    return null;
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/anon${request.nextUrl.pathname}`;
  return NextResponse.rewrite(rewriteUrl);
}

const clerkProxy = clerkMiddleware(
  clerkFrontendApiProxyConfigured
    ? { frontendApiProxy: { enabled: true } }
    : undefined,
);

export default clerkKeysConfigured
  ? function proxy(request: NextRequest, event: Parameters<typeof clerkProxy>[1]) {
      if (isAnonymousPublicReadRequest(request)) {
        return anonymousFeedRewrite(request) ?? NextResponse.next();
      }

      return clerkProxy(request, event);
    }
  : function proxy() {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
