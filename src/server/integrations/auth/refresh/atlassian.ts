import type { Account } from "@prisma/client";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";

type RefreshRes = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
};

export async function refresh(account: Account) {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as RefreshRes;
  return await prisma.account.update({
    where: {
      id: account.id,
    },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_in,
      refresh_token: data.refresh_token,
    },
  });
}
