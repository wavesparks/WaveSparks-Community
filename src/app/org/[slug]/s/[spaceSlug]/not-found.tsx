"use client";

import { LockKeyhole } from "lucide-react";
import { useParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

export default function SpaceNotFound() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <Card className="mx-auto flex min-h-64 max-w-2xl flex-col items-center justify-center text-center">
      <div className="grid size-11 place-items-center rounded-lg bg-[var(--surface-muted)] text-[var(--ink-soft)]">
        <LockKeyhole aria-hidden className="size-5" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-[var(--ink)]">
        This item is not available in this space
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--ink-soft)]">
        It may belong to another private space, have been removed, or no longer be available. No
        content from another space is shown here.
      </p>
      <LinkButton className="mt-5" href={`/org/${slug}`} variant="secondary">
        Back to my spaces
      </LinkButton>
    </Card>
  );
}
