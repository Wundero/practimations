import type { TicketType } from "@prisma/client";

export type Ticket = {
  ticketId: string;
  title: string;
  url: string;
  type: TicketType;
};

function parseType(type: string): TicketType {
  switch (type) {
    case "Bug":
      return "BUG";
    case "Task":
      return "TASK";
    case "Story":
      return "STORY";
    case "Epic":
      return "EPIC";
    default:
      return "TASK";
  }
}

export async function getJiraTickets(xmlFile: File) {
  const fileContent = await xmlFile.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(fileContent, "text/xml");
  const output: Ticket[] = [];
  xmlDoc.querySelectorAll("item").forEach((item) => {
    const url = item.querySelector("link")!.innerHTML;
    const title = item.querySelector("title")!.innerHTML;
    const ticketId = item.querySelector("key")!.innerHTML;
    const type = item.querySelector("type")!.innerHTML;
    output.push({
      ticketId,
      title,
      url,
      type: parseType(type),
    });
  });
  return output;
}
