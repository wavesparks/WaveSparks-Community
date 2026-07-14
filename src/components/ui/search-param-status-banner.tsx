"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { StatusBanner } from "@/components/ui/status-banner";

export function SearchParamStatusBanner() {
  const searchParams = useSearchParams();
  const [status] = useState(() => searchParams.get("status") ?? undefined);

  return <StatusBanner status={status} />;
}
