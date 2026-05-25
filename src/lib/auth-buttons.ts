import { demoPersonas } from "@/data/seed-data";
import { env } from "@/lib/env";

export const demoProviderButtons = env.authDevDemoEnabled
  ? demoPersonas.map((persona) => ({
      id: "demo",
      label: persona.label,
      description: persona.description,
      email: persona.email,
    }))
  : [];
