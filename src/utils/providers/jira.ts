import type { TicketType } from "@prisma/client";
import type { Ticket } from "../import";

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

export async function getJiraTicketsFromFile(xmlFile: File) {
  const fileContent = await xmlFile.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(fileContent, "text/xml");
  const output: Ticket[] = [];
  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    return "Invalid XML file";
  }
  const isJira =
    xmlDoc.querySelector("channel > title")?.innerHTML.toUpperCase() === "JIRA";
  if (!isJira) {
    return "Invalid JIRA file";
  }
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
