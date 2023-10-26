/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Session } from "next-auth";
import type { Account, Ticket } from "@prisma/client";
import { prisma } from "~/server/db";
import { TRPCError } from "@trpc/server";

export type TicketPointMap = {
  ticket: Ticket;
  value: number;
};

function oauthDomain(cloudId: string) {
  return `https://api.atlassian.com/ex/jira/${cloudId}`;
}

function getDomain(ticket: Ticket) {
  const url = new URL(ticket.url);
  return url.origin;
}

async function getAtlassian(session: Session) {
  if (session.user.accounts.length === 0) {
    throw new Error("No accounts found");
  }
  const attlassianAccount = session.user.accounts.find(
    (account) => account.provider === "atlassian",
  );
  if (!attlassianAccount) {
    throw new Error("No Atlassian account found");
  }
  const accountData = await prisma.account.findUnique({
    where: {
      id: attlassianAccount.id,
    },
  });
  if (!accountData) {
    throw new Error("No account data found");
  }
  return accountData;
}
function getAuth(accountData: Account) {
  const headers = {
    Authorization: `Bearer ${accountData.access_token}`,
    Accept: "application/json",
  };
  return headers;
}

type FieldsResJson = {
  id: string;
  key?: string;
  name: string;
  // There is other stuff but we don't need it
};

export async function getAllFields(session: Session, cloudId: string) {
  const accountData = await getAtlassian(session);
  const headers = getAuth(accountData);
  const path = "/rest/api/3/field";
  const url = `${oauthDomain(cloudId)}${path}`;
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    switch (response.status) {
      case 401:
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: response.statusText,
        });
      case 403:
        throw new TRPCError({
          code: "FORBIDDEN",
          message: response.statusText,
        });
      default:
        throw new Error(`${response.status}: ${response.statusText}`);
    }
  }
  return (await response.json()) as FieldsResJson[];
}

type AccessibleResourcesResJson = {
  id: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
};

export async function getAccessibleSites(session: Session) {
  const headers = getAuth(await getAtlassian(session));
  const url = "https://api.atlassian.com/oauth/token/accessible-resources";
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    switch (response.status) {
      case 401:
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: response.statusText,
        });
      case 403:
        throw new TRPCError({
          code: "FORBIDDEN",
          message: response.statusText,
        });
      default:
        throw new Error(`${response.status}: ${response.statusText}`);
    }
  }
  return (await response.json()) as AccessibleResourcesResJson[];
}

export async function applyPointsToTickets(
  mapping: TicketPointMap[],
  session: Session,
  fieldId: string,
  cloudId: string,
) {
  const accountData = await getAtlassian(session);
  const headers = getAuth(accountData);
  const allUpdates = mapping.map(async (ticketMap) => {
    const domain = getDomain(ticketMap.ticket);
    const body = JSON.stringify({
      fields: {
        [fieldId]: ticketMap.value,
      },
      historyMetadata: {
        activityDescription: "Applying story point values to tickets",
        description: "From practimations' export feature",
        actor: {
          id: accountData.providerAccountId,
          avatarUrl: accountData.accountImage ?? session.user.image,
          type: "user",
          displayName: accountData.accountName ?? session.user.name,
          url: `${domain}/jira/people/${accountData.providerAccountId}`,
        },
        cause: {
          id: "practimations",
          type: "estimate-export",
        },
        type: "practimations:export",
      },
    });
    const path = `/rest/api/3/issue/${ticketMap.ticket.ticketId}`;
    const response = await fetch(`${oauthDomain(cloudId)}${path}`, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: response.statusText,
          });
        case 403:
          throw new TRPCError({
            code: "FORBIDDEN",
            message: response.statusText,
          });
        default:
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${response.status}: ${response.statusText}`,
          });
      }
    }
    return true;
  });
  const successes = await Promise.all(allUpdates);
  return successes.every((success) => success);
}
