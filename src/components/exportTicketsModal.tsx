import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useCallback, useMemo, useState } from "react";
import { LinearIcon, NotionIcon } from "./icons";
import { useSession } from "next-auth/react";
import Decimal from "decimal.js";
import { cn } from "~/utils/cn";
import algorithms from "~/utils/math";
import { FaFileCsv, FaJira, FaTrello } from "react-icons/fa";
import JiraExportModal from "./jiraExportModal";
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
    icon: <FaFileCsv size={32} />,
  },
  atlassian: {
    name: "JIRA",
    disabled: false,
    icon: <FaJira size={32} />,
  },
  notion: {
    name: "Notion",
    disabled: true,
    icon: <NotionIcon size={32} />,
  },
  trello: {
    name: "Trello",
    disabled: true,
    icon: <FaTrello size={32} />,
  },
  linear: {
    name: "Linear",
    disabled: true,
    icon: <LinearIcon size={32} />,
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
  _value: Decimal | string,
  room: {
    valueRange: boolean;
    values: {
      value: Decimal;
      display: string;
    }[];
  },
) {
  const value = new Decimal(_value);
  let nearest;
  if (room.valueRange) {
    nearest = value.toFixed(1);
  } else {
    let argmin = -1;
    let argdel = new Decimal(0);
    for (let i = 0; i < room.values.length; i++) {
      const v = room.values[i]!.value;
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
    return room.tickets.filter((t) => t.done && !t.rejected);
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

  const [jiraOpen, setJiraOpen] = useState(false);

  const jiraExport = useMemo(() => {
    return completedTickets
      .map((ticket) => {
        const ticketValue = ticketValueMap[ticket.id];
        if (!ticketValue) {
          return null;
        }
        return {
          ticketId: ticket.ticketId,
          url: ticket.url,
          value:
            typeof ticketValue.value === "string"
              ? new Decimal(ticketValue.value)
              : ticketValue.value,
        };
      })
      .filter((t) => t !== null)
      .map((t) => t!);
  }, [completedTickets, ticketValueMap]);

  const exportAsCSV = useCallback(() => {
    const entries = completedTickets
      .map((ticket) => {
        const ticketValue = ticketValueMap[ticket.id];
        if (!ticketValue) {
          return null;
        }
        return {
          title: ticket.title,
          id: ticket.ticketId,
          url: ticket.url,
          value:
            typeof ticketValue.value === "string"
              ? ticketValue.value
              : ticketValue.value.toFixed(1),
        };
      })
      .filter((t) => t !== null)
      .map((t) => t!);
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
      <JiraExportModal
        open={jiraOpen}
        toExport={jiraExport}
        onClose={() => {
          setJiraOpen(false);
        }}
        onComplete={() => {
          setJiraOpen(false);
          props.onClose();
        }}
      />
      <div className="modal-box relative max-w-3xl">
        <h3 className="pb-4 text-center text-xl">Export Tickets</h3>
        <div className="flex w-full flex-col items-center justify-center">
          <label className="label">
            <span className="label-text">
              Choose a method to export your tickets
            </span>
          </label>
          <div className="flex items-center gap-3 pb-3">
            {DestinationMap[exportDestination].icon}
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
        </div>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto pt-4">
          <div key={"global"} className="flex flex-col gap-2 rounded-md p-2 bg-base-300 text-base-content">
            <span className="rounded-md p-1 font-bold">
              Apply to all tickets
            </span>
            <div className="flex flex-wrap justify-between gap-2">
              {room?.categories.map((category) => {
                return (
                  <button
                    key={category.id.toString()}
                    className="btn"
                    onClick={() => {
                      setTicketValueMap(() => {
                        return completedTickets
                          .map((t) => {
                            const v =
                              t.overrideValue ??
                              t.results.find((r) => {
                                return r.categoryId === category.id;
                              })!.value;
                            return {
                              value: getNearestValue(v, room),
                              ticketId: t.id,
                            };
                          })
                          .reduce(
                            (acc, cur) => {
                              acc[cur.ticketId] = {
                                type: "category",
                                value: cur.value,
                                category: category.id,
                              };
                              return acc;
                            },
                            {} as Record<string, TicketSelectedValue>,
                          );
                      });
                    }}
                  >
                    <span>{category.name}</span>
                  </button>
                );
              })}
              {Object.entries(algorithms).map(([algo, fn]) => {
                return (
                  <button
                    key={algo}
                    className="btn"
                    onClick={() => {
                      setTicketValueMap(() => {
                        return completedTickets
                          .map((t) => {
                            return {
                              value: getNearestValue(fn.results(t), room!),
                              ticketId: t.id,
                            };
                          })
                          .reduce(
                            (acc, cur) => {
                              acc[cur.ticketId] = {
                                type: "algorithm",
                                algorithm: algo,
                                value: cur.value,
                              };
                              return acc;
                            },
                            {} as Record<string, TicketSelectedValue>,
                          );
                      });
                    }}
                  >
                    <span>{algo}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
                    const value = getNearestValue(
                      ticket.overrideValue ?? result.value,
                      room!,
                    );
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
                  <button
                    key={ticket.ticketId + "-delete"}
                    className={"btn"}
                    onClick={() => {
                      setTicketValueMap((prev) => {
                        const cpy = { ...prev };
                        delete cpy[ticket.id];
                        return cpy;
                      });
                    }}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-action">
          <button
            className="btn"
            disabled={
              Object.keys(ticketValueMap).length === 0
            }
            onClick={() => {
              if (exportDestination === "csv") {
                exportAsCSV();
                props.onClose();
              } else if (exportDestination === "atlassian") {
                setJiraOpen(true);
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
