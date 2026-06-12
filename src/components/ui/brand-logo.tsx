/* eslint-disable @next/next/no-img-element */
import { wavesparksAssets, wavesparksBrand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  tone = "primary",
}: {
  className?: string;
  tone?: "primary" | "light" | "dark";
}) {
  const src =
    tone === "light"
      ? wavesparksAssets.logoLight
      : tone === "dark"
        ? wavesparksAssets.logoDark
        : wavesparksBrand.logoUrl;

  return (
    <img
      alt="Wavesparks"
      className={cn("h-8 w-auto", className)}
      src={src}
    />
  );
}
