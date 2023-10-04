import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useCallback, useMemo, useState } from "react";
import { LinearIcon, NotionIcon } from "./icons";
import { useSession } from "next-auth/react";
import Decimal from "decimal.js";
import { cn } from "~/utils/cn";
import algorithms from "~/utils/math";
import { FaFileCsv, FaJira, FaTrello } from "react-icons/fa";
const DESTINATIONS = [
  "csv",
  "atlassian",
  "notion",
  "trello",
  "linear",
] as const;
type Destination = (typeof DESTINATIONS)[number];

const DestinationMap = {
  csv: {
    name: "CSV",
    icon: <FaFileCsv />,
  },
  atlassian: {
    name: "JIRA",
    disabled: false,
    icon: <FaJira />,
  },
  notion: {
    name: "Notion",
    disabled: true,
    icon: <NotionIcon />,
  },
  trello: {
    name: "Trello",
    disabled: true,
    icon: <FaTrello />,
  },
  linear: {
    name: "Linear",
    disabled: true,
    icon: <LinearIcon />,
  },
} as const;

type TicketSelectedValue =
  | {
      type: "category";
      category: number;
      value: Decimal | string;
    }
  | {
      type: "algorithm";
      algorithm: string;
      value: Decimal | string;
    };

function getNearestValue(
  value: Decimal,
  room: {
    valueRange: boolean;
    values: {
      value: Decimal;
      display: string;
    }[];
  },
) {
  let nearest;
  if (room.valueRange) {
    nearest = value.toFixed(1);
  } else {
    let argmin = -1;
    let argdel = new Decimal(0);
    for (let i = 0; i < room.values.length; i++) {
      const v = room.values[i]!.value;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      console.log(v, value, value.sub(v), value.sub(v).abs);
      const av = value.sub(v).abs();
      if (argmin === -1 || argdel.greaterThan(av)) {
        argmin = i;
        argdel = av;
      }
    }
    nearest = room.values[argmin]?.display ?? value.toFixed(1);
  }
  return nearest;
}

export default function ExportTicketsModal(props: {
  open: boolean;
  onClose: () => void;
  roomSlug: string;
}) {
  const room = api.main.getRoom.useQuery({ slug: props.roomSlug }).data;

  const session = useSession();

  const completedTickets = useMemo(() => {
    if (!room?.tickets) return [];
    return room.tickets.filter((t) => t.done);
  }, [room?.tickets]);

  const [exportDestination, setExportDestination] =
    useState<Destination>("csv");

  const [ticketValueMap, setTicketValueMap] = useState<
    Record<string, TicketSelectedValue>
  >(
    completedTickets
      .map((t) => {
        const a = algorithms.nonlinear;
        return {
          type: "algorithm",
          algorithm: "nonlinear",
          value: getNearestValue(a.results(t), room!),
          ticketId: t.id,
        };
      })
      .reduce(
        (acc, cur) => {
          acc[cur.ticketId] = {
            type: "algorithm",
            algorithm: cur.algorithm,
            value: cur.value,
          };
          return acc;
        },
        {} as Record<string, TicketSelectedValue>,
      ),
  );

  const exportAsCSV = useCallback(() => {
    const entries = completedTickets.map((ticket) => {
      const ticketValue = ticketValueMap[ticket.id]!;
      return {
        title: ticket.title,
        id: ticket.ticketId,
        url: ticket.url,
        value:
          typeof ticketValue.value === "string"
            ? ticketValue.value
            : ticketValue.value.toFixed(1),
      };
    });
    const csv = [
      {
        // Header
        title: "Title",
        id: "ID",
        url: "URL",
        value: "Value",
      },
      ...entries,
    ]
      .map((entry) => {
        return `${entry.id},${entry.title},${entry.url},${entry.value}`;
      })
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room!.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }, [completedTickets, ticketValueMap, room]);

  return (
    <HtmlDialog {...props}>
      <div className="modal-box relative max-w-3xl">
        <h3 className="pb-4 text-center text-xl">Export Tickets</h3>
        <div className="flex w-full flex-col items-center justify-center">
          <label className="label">
            <span className="label-text">
              Choose a method to export your tickets
            </span>
          </label>
          <select
            className="select select-bordered"
            onChange={(e) => {
              setExportDestination(e.target.value as Destination);
            }}
            value={exportDestination}
          >
            {DESTINATIONS.filter((d) => {
              if (d === "csv") {
                return true;
              }
              if (DestinationMap[d].disabled) {
                return false;
              }
              const hasAccount = session?.data?.user.accounts.some((a) => {
                return a.provider === d;
              });
              if (!hasAccount) {
                return false;
              }
              return completedTickets.every((t) => {
                const url = new URL(t.url);
                return url.origin.includes(d);
              });
            }).map((d) => {
              return (
                <option className="" key={d} value={d}>
                  {DestinationMap[d].name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto pt-4">
          {completedTickets.map((ticket) => {
            const ticketValue = ticketValueMap[ticket.id];
            return (
              <div
                key={ticket.id}
                className={cn("flex flex-col gap-2 rounded-md p-2", {
                  "bg-base-300 text-base-content": !ticketValueMap[ticket.id],
                  "bg-secondary text-secondary-content":
                    !!ticketValueMap[ticket.id],
                })}
              >
                <a
                  href={ticket.url}
                  className="link rounded-md p-1 font-semibold"
                >
                  {ticket.title}
                </a>
                <div className="flex flex-wrap justify-between gap-2">
                  {ticket.results.map((result) => {
                    const category = room?.categories.find(
                      (c) => c.id === result.categoryId,
                    );
                    const value = getNearestValue(result.value, room!);
                    return (
                      <button
                        key={result.id.toString()}
                        className={cn("btn", {
                          "btn-primary":
                            !!ticketValue &&
                            ticketValue.type === "category" &&
                            ticketValue.category === category?.id,
                        })}
                        onClick={() => {
                          setTicketValueMap((prev) => {
                            return {
                              ...prev,
                              [ticket.id]: {
                                type: "category",
                                category: category!.id,
                                value,
                              },
                            };
                          });
                        }}
                      >
                        <span className="flex gap-2">
                          <span>{category?.name}</span>
                          <span>{value}</span>
                        </span>
                      </button>
                    );
                  })}
                  {Object.entries(algorithms).map(([algo, fn]) => {
                    const value = getNearestValue(fn.results(ticket), room!);

                    return (
                      <button
                        key={algo}
                        className={cn("btn", {
                          "btn-primary":
                            !!ticketValue &&
                            ticketValue.type === "algorithm" &&
                            ticketValue.algorithm === algo,
                        })}
                        onClick={() => {
                          setTicketValueMap((prev) => {
                            return {
                              ...prev,
                              [ticket.id]: {
                                type: "algorithm",
                                algorithm: algo,
                                value,
                              },
                            };
                          });
                        }}
                      >
                        <span className="flex gap-2">
                          <span>{algo}</span>
                          {room!.valueRange ? (
                            <span>{value}</span>
                          ) : (
                            <span>{value}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-action">
          <button
            className="btn"
            disabled={
              Object.keys(ticketValueMap).length !== completedTickets.length
            }
            onClick={() => {
              if (exportDestination === "csv") {
                exportAsCSV();
                props.onClose();
              }
            }}
          >
            {false ? (
              <>
                <span className="loading loading-spinner"></span>Exporting...
              </>
            ) : (
              "Export"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
