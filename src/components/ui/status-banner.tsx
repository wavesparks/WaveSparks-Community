"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useEffect } from "react";

import { getStatusBannerCopy } from "@/lib/activation";
import { cn } from "@/lib/utils";

export type StatusBannerTone = "success" | "warning" | "error" | "info";

export interface StatusBannerProps {
  spaceName?: string;
  status?: string;
  tone?: StatusBannerTone;
}

const errorStatusParts = [
  "error",
  "failed",
  "conflict",
  "invalid",
  "unauthorized",
  "forbidden",
  "unconfigured",
  "session_required",
] as const;

const warningStatusParts = [
  "incomplete",
  "existing",
  "empty",
  "too_large",
  "no_selection",
  "partially",
] as const;

function inferredTone(status?: string): StatusBannerTone {
  const normalizedStatus = status?.toLowerCase() ?? "";

  if (errorStatusParts.some((part) => normalizedStatus.includes(part))) {
    return "error";
  }
  if (warningStatusParts.some((part) => normalizedStatus.includes(part))) {
    return "warning";
  }
  return "success";
}

function spaceStatusCopy(status: string | undefined, spaceName: string | undefined) {
  if (!status || !spaceName) return null;

  switch (status) {
    case "post_created":
      return {
        title: `Post published in ${spaceName}`,
        body: `Only active members of ${spaceName} can see it. It was not shared with another Space.`,
      };
    case "intro_requested":
      return {
        title: "Space intro request sent",
        body: `The request stays inside ${spaceName} and can be tracked from this Space’s requests page.`,
      };
    case "intro_existing":
      return {
        title: "Space intro already exists",
        body: `You already have an introduction request with this member inside ${spaceName}.`,
      };
    case "comment_added":
      return {
        title: "Comment added",
        body: `Your reply is visible only to members who can access ${spaceName}.`,
      };
    case "post_saved":
      return {
        title: "Post saved",
        body: `This thread is now in your saved Knowledge view for ${spaceName}.`,
      };
    case "post_unsaved":
      return {
        title: "Post removed from saved",
        body: `This thread is no longer in your saved Knowledge view for ${spaceName}.`,
      };
    case "member_followed":
      return {
        title: `Following in ${spaceName}`,
        body: "Their activity can now be highlighted to you within this Space only.",
      };
    case "member_unfollowed":
      return {
        title: `Unfollowed in ${spaceName}`,
        body: "Their activity will no longer be prioritized for you within this Space.",
      };
    case "match_feedback_saved":
      return {
        title: "Feedback saved",
        body: `Your private signal will improve matching quality inside ${spaceName}.`,
      };
    case "notifications_read":
      return {
        title: "Space notifications marked read",
        body: `Notifications from ${spaceName} are now cleared. Other Spaces are unchanged.`,
      };
    default:
      return null;
  }
}

export function StatusBanner({ spaceName, status, tone }: StatusBannerProps) {
  const copy = spaceStatusCopy(status, spaceName) ?? getStatusBannerCopy(status);
  const resolvedTone = tone ?? inferredTone(status);
  const Icon =
    resolvedTone === "success"
      ? CheckCircle2
      : resolvedTone === "warning"
        ? AlertTriangle
        : resolvedTone === "error"
          ? AlertCircle
          : Info;

  useEffect(() => {
    if (!copy || !window.location.search.includes("status=")) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [copy]);

  if (!copy) {
    return null;
  }

  return (
    <div
      aria-live={resolvedTone === "error" ? "assertive" : "polite"}
      className={cn(
        "flex gap-3 rounded-lg border bg-[var(--surface)] p-4 text-sm text-[var(--ink)] shadow-[0_18px_50px_rgba(34,27,68,0.10)]",
        resolvedTone === "success" && "border-emerald-600/25",
        resolvedTone === "warning" && "border-amber-600/30 bg-amber-50",
        resolvedTone === "error" && "border-red-600/25 bg-red-50",
        resolvedTone === "info" && "border-[var(--accent)]/20",
      )}
      role={resolvedTone === "error" ? "alert" : "status"}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-5 shrink-0",
          resolvedTone === "success" && "text-emerald-700",
          resolvedTone === "warning" && "text-amber-700",
          resolvedTone === "error" && "text-red-700",
          resolvedTone === "info" && "text-[var(--accent)]",
        )}
      />
      <div>
        <p className="font-semibold text-[var(--ink)]">{copy.title}</p>
        <p className="mt-1 leading-6">{copy.body}</p>
      </div>
    </div>
  );
}
