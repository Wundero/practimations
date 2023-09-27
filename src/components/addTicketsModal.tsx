import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useMemo, useRef, useState } from "react";
import { cn } from "~/utils/cn";
import { type Ticket, getJiraTickets } from "~/utils/jira";
import type { TicketType } from "@prisma/client";
import { MdOutlineClose } from "react-icons/md";
import { ADiv } from "~/components/aDiv";

export default function AddTicketsModal(props: {
  open: boolean;
  onClose: () => void;
  roomId: number;
  roomSlug: string;
}) {
  const addTicketMutation = api.main.addTickets.useMutation();

  const fileRef = useRef<HTMLInputElement>(null);

  const utils = api.useContext();

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const fileInputOnSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!fileRef.current) {
      return;
    }
    const file = fileRef.current.files?.[0];
    if (!file) {
      return;
    }
    const tickets = await getJiraTickets(file);
    setTickets(tickets);
  };

  const [type, setType] = useState<TicketType>("TASK" as TicketType);
  const [ticketId, setTicketId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const urlValid = useMemo(() => {
    if (!url) {
      return false;
    }
    // if URL has `canParse`, use that
    if ("canParse" in URL) {
      return URL.canParse(url);
    }
    try {
      // @ts-expect-error TS expects 'canParse' to exist
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }, [url]);

  const textInputOnSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!urlValid) {
      return;
    }
    setTickets((tickets) => [
      ...tickets,
      {
        ticketId,
        title,
        url,
        type,
      },
    ]);
    setTicketId("");
    setTitle("");
    setUrl("");
    setType("TASK");
  };

  const [ticketsExpanded, setTicketsExpanded] = useState<boolean>(true);

  return (
    <HtmlDialog {...props}>
      <div className="modal-box max-w-3xl">
        <h3 className="pb-4 text-center text-xl">Add Tickets</h3>
        <div className="my-2 flex justify-center gap-2">
          <form
            onSubmit={textInputOnSubmit}
            className="flex flex-grow flex-col items-center justify-center gap-2"
          >
            <input
              type="text"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="Ticket ID"
              name="ticketId"
              className="input input-bordered w-full"
            />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ticket Title"
              name="ticketTitle"
              className="input input-bordered w-full"
            />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ticket URL"
              name="url"
              className={cn("input input-bordered w-full", {
                "input-error": url && !urlValid,
              })}
            />
            <select
              className={cn("select select-bordered w-full", {
                "text-info": type === "TASK",
                "text-error": type === "BUG",
                "text-success": type === "STORY",
                "text-primary": type === "EPIC",
              })}
              value={type}
              onChange={(e) => {
                setType(e.target.value as TicketType);
              }}
            >
              <option className="text-info">TASK</option>
              <option className="text-error">BUG</option>
              <option className="text-success">STORY</option>
              <option className="text-primary">EPIC</option>
            </select>
            <button
              className="btn w-fit"
              type="submit"
              disabled={!ticketId || !title || !urlValid}
            >
              Add Ticket
            </button>
          </form>
          <div className="divider divider-horizontal">OR</div>
          <form
            onSubmit={(e) => {
              fileInputOnSubmit(e).catch((e) => console.error(e));
            }}
            className="flex flex-grow flex-col items-center justify-center gap-4"
          >
            <input
              type="file"
              accept="text/xml"
              ref={fileRef}
              className="file-input file-input-bordered w-full"
            />
            <button className="btn w-fit" type="submit">
              Upload
            </button>
          </form>
        </div>
        <div className="collapse bg-base-200 text-base-content">
          <input
            type="checkbox"
            checked={ticketsExpanded}
            onChange={(e) => setTicketsExpanded(e.target.checked)}
          />
          <div className="text-bold collapse-title text-lg">
            {tickets.length} Tickets (click to{" "}
            {ticketsExpanded ? "hide" : "show"})
          </div>
          <ADiv className="collapse-content my-2 flex flex-col gap-1">
            {tickets.map((ticket) => {
              return (
                <div
                  key={ticket.ticketId}
                  className={cn(
                    "flex w-fit items-center gap-2 rounded-md px-2 py-1",
                    {
                      "bg-info text-info-content": ticket.type === "TASK",
                      "bg-error text-error-content": ticket.type === "BUG",
                      "bg-success text-success-content":
                        ticket.type === "STORY",
                      "bg-primary text-primary-content": ticket.type === "EPIC",
                    },
                  )}
                >
                  <button
                    className="btn btn-circle btn-ghost btn-xs"
                    onClick={() => {
                      setTickets(
                        tickets.filter((t) => t.ticketId !== ticket.ticketId),
                      );
                    }}
                  >
                    <MdOutlineClose size={16} />
                  </button>
                  <a
                    href={ticket.url}
                    target="_blank"
                    className="font-bold underline"
                  >
                    {ticket.title}
                  </a>
                </div>
              );
            })}
          </ADiv>
        </div>
        <div className="modal-action">
          <button
            className="btn"
            disabled={tickets.length === 0}
            onClick={() => {
              utils.main.getRoom.setData({ slug: props.roomSlug }, (prev) => {
                if (!prev) {
                  return prev;
                }
                const mappedTickets = tickets.map((ticket) => {
                  return {
                    ...ticket,
                    roomId: props.roomId,
                    selected: false,
                    voting: false,
                    done: false,
                    votes: [],
                    results: [],
                    id: -Math.ceil(Math.random() * 1000),
                  };
                });
                return {
                  ...prev,
                  tickets: [...prev.tickets, ...mappedTickets],
                };
              });
              addTicketMutation.mutate(
                {
                  roomId: props.roomId,
                  tickets,
                },
                {
                  onSuccess() {
                    props.onClose();
                    utils.main.getRoom
                      .invalidate({ slug: props.roomSlug })
                      .catch((e) => {
                        console.error(e);
                      });
                  },
                },
              );
            }}
          >
            {addTicketMutation.isLoading ? (
              <>
                <span className="loading loading-spinner"></span>Adding...
              </>
            ) : (
              "Add Tickets"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
