import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import LinkedInProvider from "next-auth/providers/linkedin";

import { demoPersonas, findSeedUserByEmail } from "@/data/seed-data";
import { env, isOAuthConfigured } from "@/lib/env";

const providers: NextAuthOptions["providers"] = [];

if (isOAuthConfigured("google")) {
  providers.push(
    GoogleProvider({
      clientId: env.googleClientId!,
      clientSecret: env.googleClientSecret!,
    }),
  );
}

if (isOAuthConfigured("github")) {
  providers.push(
    GitHubProvider({
      clientId: env.githubId!,
      clientSecret: env.githubSecret!,
    }),
  );
}

if (isOAuthConfigured("linkedin")) {
  providers.push(
    LinkedInProvider({
      clientId: env.linkedinClientId!,
      clientSecret: env.linkedinClientSecret!,
    }),
  );
}

if (env.authDevDemoEnabled) {
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo access",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        if (!email) {
          return null;
        }

        const seedUser = findSeedUserByEmail(email);
        if (!seedUser) {
          return null;
        }

        return {
          id: seedUser.id,
          name: seedUser.name,
          email: seedUser.email,
          image: seedUser.imageUrl,
        };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: env.nextAuthSecret,
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        if (token.email) {
          session.user.email = token.email;
        }
        if (token.picture) {
          session.user.image = String(token.picture);
        }
      }

      return session;
    },
  },
};

export const configuredProviderButtons = [
  isOAuthConfigured("google")
    ? { id: "google", label: "Continue with Google", description: "Most convenient for current Wavespark members." }
    : null,
  isOAuthConfigured("github")
    ? { id: "github", label: "Continue with GitHub", description: "Great for technical founders and operators." }
    : null,
  isOAuthConfigured("linkedin")
    ? { id: "linkedin", label: "Continue with LinkedIn", description: "Useful for mentors and invited outsiders." }
    : null,
]
  .filter(Boolean) as Array<{ id: string; label: string; description: string }>;

export const demoProviderButtons = env.authDevDemoEnabled
  ? demoPersonas.map((persona) => ({
      id: "demo",
      label: persona.label,
      description: persona.description,
      email: persona.email,
    }))
  : [];
