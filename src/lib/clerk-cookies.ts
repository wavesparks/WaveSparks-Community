export function looksLikeClerkSessionCookie(name: string) {
  return (
    name === "__session" ||
    name.startsWith("__client") ||
    name.startsWith("__clerk") ||
    name.startsWith("clerk_")
  );
}

export function hasPotentialClerkSessionCookie(
  cookies: Iterable<{ name: string }>,
) {
  for (const cookie of cookies) {
    if (looksLikeClerkSessionCookie(cookie.name)) {
      return true;
    }
  }

  return false;
}
