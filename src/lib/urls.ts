import { env } from "@/lib/env";

export function absoluteAppUrl(path: string) {
  const baseUrl = env.appUrl.endsWith("/") ? env.appUrl : `${env.appUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  return new URL(normalizedPath, baseUrl).toString();
}
