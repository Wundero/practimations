import type { OAuthConfig } from "next-auth/providers";

export type NotionOptions = Partial<
  Omit<
    OAuthConfig<NotionProfile>,
    "id" | "name" | "type" | "clientId" | "clientSecret"
  >
> & {
  clientId: string;
  clientSecret: string;
};

export type NotionProfile = {
  id: string;
  name?: string;
  image?: string;
  email?: string;
};

export function NotionProvider(
  options: NotionOptions,
): OAuthConfig<NotionProfile> {
  return {
    id: "notion",
    name: "Notion",
    type: "oauth",
    version: "2.0",
    authorization: {
      url: "https://api.notion.com/v1/oauth/authorize",
      params: {
        owner: "user",
      },
    },
    token: "https://api.notion.com/v1/oauth/token",
    userinfo: {
      request({ tokens }) {
        const { user } = tokens.owner as {
          type: "user";
          user?: {
            id: string;
            name?: string;
            avatar_url?: string;
            person?: {
              email?: string;
            };
          };
        };
        const out = {
          id: user?.id,
          name: user?.name,
          image: user?.avatar_url,
          email: user?.person?.email,
        };
        delete tokens.owner;
        delete tokens.bot_id;
        delete tokens.workspace_id;
        delete tokens.workspace_name;
        delete tokens.workspace_icon;
        delete tokens.duplicated_template_id;
        return out;
      },
    },
    profile: (profile, tokens) => {
      tokens.accountName = profile.name;
      tokens.accountEmail = profile.email;
      tokens.accountImage = profile.image;
      return {
        id: profile.id,
        name: profile.name,
        image: profile.image,
      };
    },
    ...options,
  };
}
