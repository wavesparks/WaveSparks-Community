import Link from "next/link";
import { Hash } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { CommunityChannel } from "@/lib/channels";

export function ChannelShortcutBar({
  channels,
  title = "Channels",
}: {
  channels: CommunityChannel[];
  title?: string;
}) {
  return (
    <Card className="space-y-3 overflow-hidden p-4 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,var(--cyan),var(--accent),var(--gold))]">
      <div className="flex items-center gap-2">
        <Hash className="size-4 text-[var(--accent)]" />
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {channels.map((channel) => (
          <Link
            className="min-w-40 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
            href={channel.href}
            key={channel.id}
          >
            <span className="block text-sm font-semibold text-[var(--ink)]">
              {channel.label}
            </span>
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--ink-soft)]">
              {channel.description}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
