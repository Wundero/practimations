import type { TicketType } from "@prisma/client";
import { getJiraTicketsFromFile } from "./providers/jira";

export type Ticket = {
  ticketId: string;
  title: string;
  url: string;
  type: TicketType;
};

export const PROVIDERS = ["jira", "linear", "notion", "trello"] as const;
export type Provider = (typeof PROVIDERS)[number];

export async function importTicketsFromFile(file: File): Promise<Ticket[]> {
  if (file.type === "text/xml") {
    // Try JIRA
    const result = await getJiraTicketsFromFile(file);
    if (typeof result !== "string") {
      return result;
    }
    // Parsing JIRA failed
  }

  return [];
}
