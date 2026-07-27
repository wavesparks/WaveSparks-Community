import type { Metadata } from "next";
import { Host_Grotesk, Urbanist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
  title: "Wavesparks Community",
  description: "A private community for Wavesparks members and event participants.",
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
      proxyUrl={env.clerkProxyUrl}
      signInFallbackRedirectUrl={env.clerkSignInFallbackRedirectUrl}
      signInUrl={env.clerkSignInUrl}
      signUpFallbackRedirectUrl={env.clerkSignUpFallbackRedirectUrl}
      signUpUrl={env.clerkSignUpUrl}
    >
      {children}
    </ClerkProvider>
  );
}
