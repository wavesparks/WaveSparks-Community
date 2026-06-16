import type { Metadata } from "next";
import { Host_Grotesk, Urbanist } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

import { env, isClerkConfigured } from "@/lib/env";

const headingFont = Host_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const bodyFont = Urbanist({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wavespark Community Platform",
  description:
    "A semi-private, multi-tenant founder community platform for Wavespark and future cohorts.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkBoundary>{children}</ClerkBoundary>
      </body>
    </html>
  );
}

function ClerkBoundary({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) {
    return children;
  }

  return (
    <ClerkProvider
      proxyUrl="/__clerk"
      signInFallbackRedirectUrl={env.clerkSignInFallbackRedirectUrl}
      signInUrl={env.clerkSignInUrl}
      signUpFallbackRedirectUrl={env.clerkSignUpFallbackRedirectUrl}
      signUpUrl={env.clerkSignUpUrl}
    >
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex min-h-12 w-full max-w-7xl items-center justify-end gap-2 px-4 sm:px-6 lg:px-8">
          <Show when="signed-out">
            <SignInButton>
              <button
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                type="button"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button
                className="inline-flex h-9 items-center rounded-lg bg-[var(--night)] px-3 text-sm font-semibold text-[var(--surface)] shadow-sm transition hover:bg-[var(--blue)]"
                type="button"
              >
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>
      {children}
    </ClerkProvider>
  );
}
