import Image from "next/image";

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
  const width = tone === "dark" ? 2628 : 2627;

  return (
    <Image
      alt="Wavesparks"
      className={cn(
        "block w-[13.7rem] max-w-full",
        className,
        "h-auto object-contain",
      )}
      height={385}
      sizes="220px"
      src={src}
      width={width}
    />
  );
}
