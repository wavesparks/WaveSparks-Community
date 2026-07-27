import type { IntroStatus } from "@/lib/domain";

const pendingIntroStatusCopy = {
  title: "Introduction pending",
  body: "Your request is waiting for a response.",
} as const;

export function getActiveIntroStatusCopy(status?: IntroStatus) {
  return status === "pending" ? pendingIntroStatusCopy : null;
}
