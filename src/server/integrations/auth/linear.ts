import { LinearClient } from "@linear/sdk";
import type { TokenSet } from "next-auth";
import type { OAuthConfig } from "next-auth/providers";

export type LinearOptions = Partial<
  Omit<
    OAuthConfig<LinearProfile>,
    "id" | "name" | "type" | "clientId" | "clientSecret"
  >
> & {
  clientId: string;
  clientSecret: string;
};

async function userinfo({ tokens }: { tokens: TokenSet }) {
  if (!tokens.access_token) {
    throw new Error("Missing access token.");
  }
  const client = new LinearClient({
    accessToken: tokens.access_token,
  });
  return await client.viewer;
}

export type LinearProfile = Awaited<ReturnType<typeof userinfo>>;

export function LinearProvider(
  options: LinearOptions,
): OAuthConfig<LinearProfile> {
  return {
    id: "linear",
    name: "Linear",
    type: "oauth",
    version: "2.0",
    authorization: {
      url: "https://linear.app/oauth/authorize",
      params: {
        scope: "read,write",
      },
    },
    token: "https://api.linear.app/oauth/token",
    userinfo: {
      request: userinfo,
    },
    profile: (profile, tokens) => {
      tokens.accountName = profile.name;
      tokens.accountEmail = profile.email;
      tokens.accountImage = profile.avatarUrl;
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.avatarUrl,
      };
    },
    ...options,
  };
}
