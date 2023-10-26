export * from "./atlassian";

import type { Account } from "@prisma/client";
import { refresh as atlassianRefresh } from "./atlassian";

type RefreshFn = (account: Account) => Promise<Account>;

const fnMap: Record<string, RefreshFn> = {
  atlassian: atlassianRefresh,
};

export async function refresh(account: Account) {
  const fn = fnMap[account.provider];
  if (!fn) {
    return account;
  }
  return fn(account);
}

export async function refreshAnyExpired(accounts: Account[]) {
  const now = Date.now();
  const out: Promise<Account>[] = [];
  for (const account of accounts) {
    if (account.expires_at == null) {
      out.push(Promise.resolve(account));
      continue;
    }
    if (account.expires_at * 1000 < now) {
      out.push(refresh(account));
    }
    out.push(Promise.resolve(account));
  }
  return Promise.all(out);
}
