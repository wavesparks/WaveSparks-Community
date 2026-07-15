import type { IntroStatus } from "@/lib/domain";

const activeIntroStatusCopy = {
  accepted: {
    title: "Introduction accepted",
    body: "Contact details are available in Introductions.",
  },
  declined: {
    title: "Introduction declined",
    body: "The request is closed for now.",
  },
  pending: {
    title: "Introduction pending",
    body: "Your request is waiting for a response.",
  },
} as const;

export function getActiveIntroStatusCopy(status?: IntroStatus) {
  return status && status !== "expired" ? activeIntroStatusCopy[status] : null;
}
