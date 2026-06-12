/* eslint-disable @next/next/no-img-element */
import { wavesparksBrand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      alt="Wavesparks"
      className={cn("h-8 w-auto", className)}
      src={wavesparksBrand.logoUrl}
    />
  );
}
