import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { findSeedUserByEmail } from "@/data/seed-data";
import { env } from "@/lib/env";
import { authorizePasswordUser } from "@/server/store";

const providers: NextAuthOptions["providers"] = [];

providers.push(
  CredentialsProvider({
    id: "password",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const user = await authorizePasswordUser({
        email: credentials?.email,
        password: credentials?.password,
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.imageUrl,
      };
    },
  }),
);

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
  pages: {
    signIn: "/org/wavespark/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
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
