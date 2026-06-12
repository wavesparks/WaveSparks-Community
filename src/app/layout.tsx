import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Host_Grotesk, Urbanist } from "next/font/google";
import "./globals.css";

import { isClerkConfigured } from "@/lib/env";

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
  const content = isClerkConfigured() ? (
    <ClerkProvider>{children}</ClerkProvider>
  ) : (
    children
  );

  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{content}</body>
    </html>
  );
}
