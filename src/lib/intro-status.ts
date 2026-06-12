import type { IntroStatus } from "@/lib/domain";

const activeIntroStatusCopy = {
  accepted: {
    title: "Intro accepted",
    body: "Contact details are available in your requests inbox.",
  },
  declined: {
    title: "Intro declined",
    body: "The request is closed for now.",
  },
  pending: {
    title: "Intro pending",
    body: "Your request is waiting for a response.",
  },
} as const;

export function getActiveIntroStatusCopy(status?: IntroStatus) {
  return status && status !== "expired" ? activeIntroStatusCopy[status] : null;
}
