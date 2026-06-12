"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCsrfToken } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function subscribeToHydration() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function PasswordSignInForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const csrfTokenRef = useRef<string | null>(null);
  const csrfTokenPromiseRef = useRef<Promise<string | undefined> | null>(null);
  const ready = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    csrfTokenPromiseRef.current = getCsrfToken().then((token) => {
      csrfTokenRef.current = token ?? null;
      return token;
    });
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const callbackUrl = `/org/${slug}`;
    const csrfToken =
      csrfTokenRef.current ??
      (await (csrfTokenPromiseRef.current ?? getCsrfToken()));

    const response = await fetch("/api/auth/callback/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        csrfToken: csrfToken ?? "",
        callbackUrl,
        json: "true",
      }),
    });

    setPending(false);

    const result = (await response.json()) as { url?: string | null };
    const resultUrl = result.url ? new URL(result.url, window.location.origin) : null;

    if (!response.ok || resultUrl?.searchParams.has("error")) {
      setError("Invalid email or password.");
      return;
    }

    router.push(resultUrl ? `${resultUrl.pathname}${resultUrl.search}` : callbackUrl);
    router.refresh();
  }

  return (
    <form className="space-y-4" method="post" onSubmit={onSubmit}>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          placeholder="you@wavesparks.co"
          required
          type="email"
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      <Button className="w-full" disabled={pending || !ready} type="submit">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
