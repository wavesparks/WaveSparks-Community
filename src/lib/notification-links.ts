export function safeNotificationHref(
  orgSlug: string,
  link: string,
  spaceSlug?: string,
) {
  try {
    const url = new URL(link, "https://wavesparks.local");
    if (url.origin !== "https://wavesparks.local") return undefined;
    const orgRoot = `/org/${orgSlug}`;
    const allowedRoot = spaceSlug ? `${orgRoot}/s/${spaceSlug}` : orgRoot;
    if (url.pathname !== allowedRoot && !url.pathname.startsWith(`${allowedRoot}/`)) {
      return undefined;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}
