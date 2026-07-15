"use client";

import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { StatusBanner } from "@/components/ui/status-banner";

function subscribeToHydration() {
  return () => {};
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

export function SearchParamStatusBanner() {
  const searchParams = useSearchParams();
  const [status] = useState(() => searchParams.get("status") ?? undefined);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  return hydrated ? <StatusBanner status={status} /> : null;
}
