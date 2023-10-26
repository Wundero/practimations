import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import GithubProvider from "next-auth/providers/github";
import AtlassianProvider from "next-auth/providers/atlassian";
import GitlabProvider from "next-auth/providers/gitlab";

import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { LinearProvider } from "./integrations/auth/linear";
import { NotionProvider } from "./integrations/auth/notion";
import { refreshAnyExpired } from "./integrations/auth/refresh";

function generateProviders() {
  const providers = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GithubProvider({
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        profile(profile, tokens) {
          tokens.accountName = profile.name;
          tokens.accountEmail = profile.email;
          tokens.accountImage = profile.avatar_url;
          return {
            id: profile.id.toString(),
            name: profile.name ?? profile.login,
            email: profile.email,
            image: profile.avatar_url,
          };
        },
      }),
    );
  }
  if (env.ATLASSIAN_CLIENT_ID && env.ATLASSIAN_CLIENT_SECRET) {
    providers.push(
      AtlassianProvider({
        clientId: env.ATLASSIAN_CLIENT_ID,
        clientSecret: env.ATLASSIAN_CLIENT_SECRET,
        authorization: {
          url: "https://auth.atlassian.com/authorize",
          params: {
            scope:
              "write:jira-work read:jira-work read:jira-user offline_access read:me",
            audience: "api.atlassian.com",
            prompt: "consent",
          },
        },
        profile(profile, tokens) {
          tokens.accountName = profile.name;
          tokens.accountEmail = profile.email;
          tokens.accountImage = profile.picture;
          return {
            id: profile.account_id,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      }),
    );
  }
  if (env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET) {
    providers.push(
      GitlabProvider({
        clientId: env.GITLAB_CLIENT_ID,
        clientSecret: env.GITLAB_CLIENT_SECRET,
        profile(profile, tokens) {
          tokens.accountName = profile.name ?? profile.username;
          tokens.accountEmail = profile.email;
          tokens.accountImage = profile.avatar_url;
          return {
            id: profile.id.toString(),
            name: profile.name ?? profile.username,
            email: profile.email,
            image: profile.avatar_url,
          };
        },
      }),
    );
  }
  if (env.LINEAR_CLIENT_ID && env.LINEAR_CLIENT_SECRET) {
    providers.push(
      LinearProvider({
        clientId: env.LINEAR_CLIENT_ID,
        clientSecret: env.LINEAR_CLIENT_SECRET,
      }),
    );
  }
  if (env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET) {
    providers.push(
      NotionProvider({
        clientId: env.NOTION_CLIENT_ID,
        clientSecret: env.NOTION_CLIENT_SECRET,
      }),
    );
  }
  if (providers.length === 0) {
    throw new Error(
      "No OAuth providers configured! Please check your environment variables.",
    );
  }
  return providers;
}

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      id: string;
      // ...other properties
      // role: UserRole;
      accounts: {
        id: string;
        provider: string;
        providerAccountId: string;
        accountName: string | null;
        accountEmail: string | null;
        accountImage: string | null;
      }[];
    };
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: async ({ session, user }) => {
      let accounts = await prisma.account.findMany({
        where: {
          userId: user.id,
          access_token: {
            not: null,
          },
        },
      });
      accounts = await refreshAnyExpired(accounts);
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          accounts: accounts.map(
            ({
              accountEmail,
              accountName,
              accountImage,
              id,
              provider,
              providerAccountId,
            }) => {
              return {
                accountEmail,
                accountName,
                accountImage,
                id,
                provider,
                providerAccountId,
              };
            },
          ),
        },
      };
    },
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    ...generateProviders(),
    /**
     * ...add more providers here.
     *
     * Most other providers require a bit more work than the Discord provider. For example, the
     * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
     * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
     *
     * @see https://next-auth.js.org/providers/github
     */
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
