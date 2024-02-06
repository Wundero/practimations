/* eslint-disable @next/next/no-img-element */
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { api } from "~/utils/api";
import { usePusherChannel } from "~/hooks/usePusher";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getServerAuthSession } from "~/server/auth";
import { useRouter } from "next/router";
import { cn } from "~/utils/cn";
import { FaCrown, FaEye, FaRegCheckSquare } from "react-icons/fa";
import AddTicketsModal from "~/components/addTicketsModal";
import {
  MdAdd,
  MdCheck,
  MdContentCopy,
  MdHome,
  MdHourglassBottom,
  MdOutlineClose,
  MdPause,
  MdPlayArrow,
  MdShare,
  MdUpdate,
} from "react-icons/md";
import { PiExport } from "react-icons/pi";
import { serverSideHelpers } from "~/server/api/ssr";
import Link from "next/link";
import type { Event, Data } from "~/server/integrations/pusher";
import superjson from "superjson";
import algorithms from "~/utils/math";
import { BiCoffee } from "react-icons/bi";
import Decimal from "decimal.js";
import { useNow } from "~/hooks/useNow";
import { intervalToDuration, type Duration } from "date-fns";
import { HtmlDialog } from "~/components/htmlDialog";
import { QRCode } from "~/components/qrcode";
import { ADiv } from "~/components/aDiv";
import { useTheme } from "next-themes";
import { debounce } from "~/utils/functional";
import { UserAvatar } from "~/components/userAvatar";
import ExportTicketsModal from "~/components/exportTicketsModal";
import { ClientOnly } from "~/components/clientOnly";
import TicketPointOverrideModal from "~/components/ticketPointOverrideModal";

export async function getServerSideProps({
  params,
  req,
  res,
}: GetServerSidePropsContext<{ id: string }>) {
  if (!params) {
    return {
      redirect: {
        destination: "/",
        permanent: true,
      },
    };
  }
  const session = await getServerAuthSession({ req, res });
  if (!session) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  const { id } = params;
  const helpers = await serverSideHelpers({ req, res });
  const room = await helpers.main.getRoom.fetch({ slug: id });
  if (!room) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }
  return {
    props: { session, id, trpcState: helpers.dehydrate() },
  };
}

type RoomProps = InferGetServerSidePropsType<typeof getServerSideProps>;

type PusherMember = {
  name: string;
  image: string;
};

type TimerProps = {
  start: Date | null;
  end: Date | null;
  running: boolean;
};

function customDurationFormat(dur: Duration) {
  if (dur.seconds === 0 && dur.minutes === 0 && dur.hours === 0) {
    return "0:00";
  }
  if (dur.hours === 0) {
    return `${dur.minutes ?? 0}:${
      dur.seconds?.toString().padStart(2, "0") ?? "00"
    }`;
  }
  return `${dur.hours ?? 0}:${
    dur.minutes?.toString().padStart(2, "0") ?? "00"
  }:${dur.seconds?.toString().padStart(2, "0") ?? "00"}`;
}

function Timer({ start, end, running }: TimerProps) {
  const now = useNow(100);

  const display = useMemo(() => {
    let dur;
    if (running && start) {
      dur = intervalToDuration({ start, end: now });
    } else if (start && end) {
      dur = intervalToDuration({ start, end });
    } else {
      return "0:00";
    }
    return customDurationFormat(dur);
  }, [start, end, running, now]);

  return (
    <div className="flex justify-center">
      <span className="">{display}</span>
    </div>
  );
}

function Room({ id }: RoomProps) {
  const channel = usePusherChannel(`presence-${id}`);

  const router = useRouter();

  const utils = api.useContext();

  // List of present user ids for presence detection stuff
  const [pusherMembers, setPusherMembers] = useState<string[]>([]);
  const session = useSession();

  const handlePusherEvent = useCallback(
    (event: string, data: unknown) => {
      if (process.env.NODE_ENV === "development" || true) {
        console.log("RECEIVED PUSHER EVENT:", event, data);
      }
      // Nonstandard events (pusher, room deletion) - these cannot be skipped for current user
      switch (event) {
        case "pusher:subscription_succeeded": {
          const { members } = data as {
            members: Record<string, PusherMember>;
            count: number;
            myID: string;
            me: {
              id: string;
              info: PusherMember;
            };
          };
          setPusherMembers(Object.keys(members));
          return;
        }
        case "pusher:member_added": {
          const dx = data as { id: string; info: PusherMember };
          setPusherMembers((old) => {
            return [...old, dx.id];
          });
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              users: [
                ...prev.users,
                {
                  user: {
                    id: dx.id,
                    name: dx.info.name,
                    image: dx.info.image,
                    email: null,
                    emailVerified: null,
                    currentRoomId: prev.id,
                  },
                  spectator: false,
                },
              ],
            };
          });
          utils.main.getRoom.invalidate({ slug: id }).catch(console.error);
          return;
        }
        case "pusher:member_removed": {
          setPusherMembers((old) => {
            return old.filter((id) => id !== (data as { id: string }).id);
          });
          return;
        }
        case "deleteRoom": {
          router.push("/").catch(console.error);
          return;
        }
        default:
          break;
      }
      const eventKey = event as Event;
      // @ts-expect-error >:I
      const ed = superjson.deserialize<Data<typeof eventKey>>(data);

      if (ed.ignoreUser === session.data?.user.id) {
        // Ignore events from the current user
        return;
      }
      let invalidate = false;
      switch (eventKey) {
        case "newTickets": {
          const { eventData } = ed as Data<"newTickets">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: [
                ...prev.tickets,
                ...eventData.map((ticket) => {
                  return {
                    ...ticket,
                    votes: [],
                    results: [],
                  };
                }),
              ],
            };
          });
          break;
        }
        case "userSpectate": {
          const { eventData } = ed as Data<"userSpectate">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              users: prev.users.map((user) => {
                if (user.user.id === eventData.userId) {
                  return {
                    ...user,
                    spectator: eventData.spectating,
                  };
                } else {
                  return user;
                }
              }),
            };
          });
          break;
        }
        case "updateTimer": {
          const { eventData } = ed as Data<"updateTimer">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              timer: eventData.running,
              timerStart: eventData.start,
              timerEnd: eventData.stop ?? null,
            };
          });
          break;
        }
        case "userLeave": {
          const { eventData } = ed as Data<"userLeave">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              users: prev.users.filter(
                (user) => user.user.id !== eventData.user,
              ),
            };
          });
          setPusherMembers((old) => {
            return old.filter((user) => user !== eventData.user);
          });
          break;
        }
        case "deleteTickets": {
          const { eventData } = ed as Data<"deleteTickets">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.filter(
                (ticket) => !eventData.includes(ticket.id),
              ),
            };
          });
          break;
        }
        case "updateVotes": {
          const { eventData } = ed as Data<"updateVotes">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.selected) {
                  return {
                    ...ticket,
                    votes: [
                      ...ticket.votes.filter((vote) => {
                        return vote.userId !== eventData.user;
                      }),
                      ...eventData.votes,
                    ],
                  };
                }
                return ticket;
              }),
            };
          });
          break;
        }
        case "selectTicket": {
          const { eventData } = ed as Data<"selectTicket">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.id === eventData.id) {
                  return {
                    ...ticket,
                    selected: true,
                    voting: true,
                  };
                } else {
                  return {
                    ...ticket,
                    voting: false,
                    selected: false,
                  };
                }
              }),
            };
          });
          break;
        }
        case "rejectTicket": {
          const { eventData } = ed as Data<"completeTicket">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.id === eventData.id) {
                  return {
                    ...ticket,
                    done: true,
                    voting: false,
                    selected: false,
                    rejected: true,
                  };
                } else {
                  return ticket;
                }
              }),
            };
          });
          break;
        }
        case "completeTicket": {
          const { eventData } = ed as Data<"completeTicket">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.id === eventData.id) {
                  return {
                    ...ticket,
                    done: true,
                    voting: false,
                    selected: false,
                    results: eventData.results,
                    overrideValue: eventData.overrideValue,
                  };
                } else {
                  return ticket;
                }
              }),
            };
          });
          break;
        }
        case "setCanVote": {
          const { eventData } = ed as Data<"setCanVote">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.selected) {
                  return {
                    ...ticket,
                    voting: eventData.canVote,
                  };
                } else {
                  return ticket;
                }
              }),
            };
          });
          break;
        }
        case "clearVotes": {
          const { eventData } = ed as Data<"clearVotes">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              tickets: prev.tickets.map((ticket) => {
                if (ticket.selected) {
                  return {
                    ...ticket,
                    votes:
                      eventData === "all"
                        ? []
                        : ticket.votes.filter((vote) => {
                            return vote.categoryId !== eventData.category;
                          }),
                  };
                } else {
                  return ticket;
                }
              }),
            };
          });
          break;
        }
        default:
          invalidate = true;
          break;
      }
      if (invalidate) {
        utils.main.getRoom.invalidate({ slug: id }).catch(console.error);
      }
    },
    [id, router, utils, session],
  );

  useEffect(() => {
    if (channel) {
      channel.bind_global(handlePusherEvent);
      return () => {
        channel.unbind_global(handlePusherEvent);
      };
    }
  }, [channel, handlePusherEvent]);

  const [addTicketsOpen, setAddTicketsOpen] = useState(false);

  const room = api.main.getRoom.useQuery({ slug: id }).data;

  const selectedTicket = useMemo(() => {
    if (!room) {
      return null;
    }
    return room.tickets.find((ticket) => ticket.selected);
  }, [room]);

  const loc = useMemo(() => {
    return typeof window !== "undefined" ? window.location.origin : "";
  }, []);

  const deleteTicketMutation = api.main.removeTickets.useMutation();
  const rejectTicketMutation = api.main.rejectTicket.useMutation();
  const selectTicketMutation = api.main.selectTicket.useMutation();
  const completeTicketMutation = api.main.completeTicket.useMutation();
  const voteMutation = api.main.vote.useMutation();
  const clearVotesMutation = api.main.clearVotes.useMutation();
  const setCanVoteMutation = api.main.setCanVote.useMutation();
  const updateTimer = api.main.updateTimer.useMutation();
  const setSpectatingMutation = api.main.setSpectating.useMutation();

  const [myVotes, setMyVotes] = useState<Record<bigint, number>>(
    selectedTicket
      ? selectedTicket.votes
          .filter((v) => v.userId === session.data?.user.id)
          .reduce((acc, vote) => {
            return {
              ...acc,
              [vote.categoryId]: new Decimal(vote.value).toNumber(),
            };
          }, {})
      : {},
  );

  const theme = useTheme();

  const isOwner = useMemo(() => {
    return session.data?.user.id === room?.ownerId;
  }, [room, session]);

  const isSpectator = useMemo(() => {
    return room?.users.some(({ user, spectator }) => {
      return user.id === session.data?.user.id && spectator;
    });
  }, [room, session]);

  const [showCopyMsg, setShowCopyMsg] = useState(false);

  const [onOverrideComplete, setOnOverrideComplete] = useState<
    ((v: number) => void) | null
  >(null);

  const debouncedSetShowCopyMsg = useMemo(() => {
    return debounce((v: boolean) => setShowCopyMsg(v), 1000);
  }, [setShowCopyMsg]);

  const [completedTicketShowMore, setCompletedTicketShowMore] = useState<
    bigint[]
  >([]);

  const [qrOpen, setQrOpen] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);

  if (!room) {
    return <div className="loading loading-spinner loading-lg"></div>;
  }

  return (
    <div className="relative p-1">
      <div className="absolute left-0 top-0 p-4">
        <Link href="/">
          <button className="btn btn-circle">
            <MdHome size={24} />
          </button>
        </Link>
      </div>

      <TicketPointOverrideModal
        room={room}
        open={onOverrideComplete !== null}
        onClose={() => setOnOverrideComplete(null)}
        onComplete={(value) => {
          if (onOverrideComplete) {
            onOverrideComplete(value);
          }
          setOnOverrideComplete(null);
        }}
      />

      <h1 className="flex items-center justify-center gap-2 p-4 text-center text-3xl font-extrabold">
        <div className="px-2">{room.name}</div>
        <div
          className={cn({
            "tooltip tooltip-bottom tooltip-open": showCopyMsg,
          })}
          data-tip="Copied!"
        >
          <button
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              navigator.clipboard
                .writeText(`${window.location.origin}/join/${room.slug}`)
                .catch(console.error);
              setShowCopyMsg(true);
              debouncedSetShowCopyMsg(false);
            }}
          >
            <MdContentCopy size={16} />
          </button>
        </div>
        <div>
          <HtmlDialog open={qrOpen} onClose={() => setQrOpen(false)}>
            <div className="modal-box max-w-3xl">
              <ClientOnly>
                <QRCode
                  contents={`${loc}/join/${room.slug}`}
                  moduleColor="hsl(var(--bc))"
                  positionRingColor="hsl(var(--bc))"
                  positionCenterColor="hsl(var(--bc))"
                >
                  <div className="flex justify-center">
                    <img
                      src={"/favicon.ico"}
                      alt={"practimations"}
                      className={cn({
                        "rounded-md bg-base-content p-2":
                          theme.resolvedTheme === "light",
                      })}
                    />
                  </div>
                </QRCode>
              </ClientOnly>
              <div className="modal-action">
                <button className="btn" onClick={() => setQrOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </HtmlDialog>
          <button
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              setQrOpen(true);
            }}
          >
            <MdShare size={16} />
          </button>
        </div>
        <div
          className="tooltip tooltip-bottom"
          data-tip={isSpectator ? "Stop spectating" : "Spectate"}
        >
          <button
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              utils.main.getRoom.setData({ slug: room.slug }, (prev) => {
                if (!prev) {
                  return prev;
                }
                return {
                  ...prev,
                  users: prev.users.map((user) => {
                    if (user.user.id === session.data?.user.id) {
                      return {
                        ...user,
                        spectator: !user.spectator,
                      };
                    } else {
                      return user;
                    }
                  }),
                };
              });
              setSpectatingMutation.mutate({
                roomId: room.id,
                spectating: !isSpectator,
              });
            }}
          >
            {isSpectator ? <FaRegCheckSquare size={16} /> : <FaEye size={16} />}
          </button>
        </div>
      </h1>
      <div className="order-1 grid grid-cols-1 justify-items-center gap-4 pt-2 md:grid-cols-2 xl:grid-cols-4">
        <ADiv className="flex h-fit w-fit flex-col gap-2 rounded-xl border border-accent p-4">
          <span className="text-center text-lg font-bold">
            Users ({room.users.length}/{room.maxMembers})
          </span>
          {room.users.map(({ user, spectator }) => {
            return (
              <div
                className="flex w-fit items-center gap-2 rounded-xl bg-base-300 px-2 py-1 text-base-content"
                key={user.id}
              >
                <UserAvatar
                  user={user}
                  presence={pusherMembers.includes(user.id)}
                />
                {user.name}
                {user.id === room.ownerId && (
                  <div
                    className="tooltip tooltip-info tooltip-bottom"
                    data-tip="Owner"
                  >
                    <FaCrown className="text-yellow-500" size={16} />
                  </div>
                )}
                {spectator && (
                  <div
                    className="tooltip tooltip-info tooltip-bottom"
                    data-tip="Spectating"
                  >
                    <FaEye
                      className="bg-base-300/25 text-base-content"
                      size={16}
                    />
                  </div>
                )}
                {!!selectedTicket &&
                  selectedTicket.votes.filter((vote) => vote.userId === user.id)
                    .length > 0 &&
                  !spectator && <MdCheck className="text-success" />}
                {!!selectedTicket &&
                  selectedTicket.votes.filter((vote) => vote.userId === user.id)
                    .length === 0 &&
                  !spectator && (
                    <MdHourglassBottom className="text-base-content" />
                  )}
              </div>
            );
          })}
        </ADiv>
        <ADiv className="order-3 flex h-fit w-fit flex-col gap-2 rounded-xl border border-accent p-4 xl:order-2">
          <h3 className="text-center">Incomplete tickets</h3>
          {isOwner && (
            <button
              className="btn mb-2"
              onClick={() => setAddTicketsOpen(true)}
            >
              Add Tickets
            </button>
          )}
          {room.tickets
            .filter((ticket) => !(ticket.done || ticket.selected))
            .map((ticket) => {
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
                  {isOwner && (
                    <button
                      className="btn btn-circle btn-ghost btn-xs"
                      onClick={() => {
                        utils.main.getRoom.setData(
                          { slug: room.slug },
                          (prev) => {
                            if (!prev) {
                              return prev;
                            }
                            return {
                              ...prev,
                              tickets: prev?.tickets.filter(
                                (t) => t.id !== ticket.id,
                              ),
                            };
                          },
                        );
                        deleteTicketMutation.mutate(
                          {
                            roomId: room.id,
                            tickets: [ticket.id],
                          },
                          {
                            onSuccess() {
                              utils.main.getRoom
                                .invalidate({ slug: id })
                                .catch((e) => {
                                  console.error(e);
                                });
                            },
                          },
                        );
                      }}
                    >
                      <MdOutlineClose size={16} />
                    </button>
                  )}
                  <a
                    href={ticket.url}
                    target="_blank"
                    className="font-bold underline"
                  >
                    {ticket.title}
                  </a>
                  {isOwner && !selectedTicket && (
                    <button
                      className="btn btn-circle btn-ghost btn-xs"
                      onClick={() => {
                        const start = new Date();
                        utils.main.getRoom.setData(
                          { slug: room.slug },
                          (prev) => {
                            if (!prev) {
                              return prev;
                            }
                            return {
                              ...prev,
                              timer: true,
                              timerStart: start,
                              tickets: prev.tickets.map((t) => {
                                if (t.id === ticket.id) {
                                  return {
                                    ...t,
                                    selected: true,
                                    voting: true,
                                  };
                                } else {
                                  return {
                                    ...t,
                                    selected: false,
                                  };
                                }
                              }),
                            };
                          },
                        );
                        setMyVotes(
                          room.categories.reduce(
                            (acc, category) => {
                              if (room.valueRange) {
                                acc[category.id] = new Decimal(
                                  room.values.find(
                                    (v) => v.display === "min",
                                  )!.value,
                                ).toNumber();
                              } else {
                                acc[category.id] = room.values
                                  .map((v) => ({
                                    ...v,
                                    value: new Decimal(v.value),
                                  }))
                                  .sort((a, b) =>
                                    a.value.comparedTo(b.value),
                                  )[0]!
                                  .value.toNumber();
                              }
                              return acc;
                            },
                            {} as Record<bigint, number>,
                          ),
                        );
                        updateTimer.mutate({
                          roomId: room.id,
                          running: true,
                          start,
                        });
                        selectTicketMutation.mutate(
                          {
                            ticketId: ticket.id,
                          },
                          {
                            onSuccess() {
                              utils.main.getRoom
                                .invalidate({ slug: id })
                                .catch((e) => {
                                  console.error(e);
                                });
                            },
                          },
                        );
                      }}
                    >
                      <MdAdd size={16} />
                    </button>
                  )}
                </div>
              );
            })}
        </ADiv>

        <ADiv className="order-2 flex h-fit w-fit flex-col gap-2 rounded-xl border border-accent p-4 xl:order-3">
          <h3 className="text-center">Current Ticket:</h3>
          <h4 className="flex justify-center gap-4">
            <Timer
              running={room.timer}
              end={room.timerEnd}
              start={room.timerStart}
            />
            {isOwner && (
              <div className="flex gap-2">
                <button
                  className="btn btn-circle btn-ghost btn-xs"
                  onClick={() => {
                    const start = new Date();
                    utils.main.getRoom.setData({ slug: room.slug }, (prev) => {
                      if (!prev) {
                        return prev;
                      }
                      return {
                        ...prev,
                        timer: true,
                        timerStart: start,
                      };
                    });
                    updateTimer.mutate(
                      {
                        start,
                        running: true,
                        roomId: room.id,
                      },
                      {
                        onSuccess() {
                          utils.main.getRoom
                            .invalidate({ slug: id })
                            .catch((e) => {
                              console.error(e);
                            });
                        },
                      },
                    );
                  }}
                >
                  <MdUpdate size={16} />
                </button>
                <button
                  className="btn btn-circle btn-ghost btn-xs"
                  onClick={() => {
                    const end = new Date();
                    let start = room.timerStart ?? new Date();
                    if (!room.timer) {
                      const oldEnd = room.timerEnd;
                      if (oldEnd) {
                        const now = new Date();
                        const oldStart = new Date(
                          start.getTime() + (now.getTime() - oldEnd.getTime()),
                        );
                        start = oldStart;
                      }
                    }
                    utils.main.getRoom.setData({ slug: room.slug }, (prev) => {
                      if (!prev) {
                        return prev;
                      }
                      return {
                        ...prev,
                        timer: !prev.timer,
                        timerEnd: end,
                        timerStart: start,
                      };
                    });
                    updateTimer.mutate(
                      {
                        start,
                        stop: end,
                        running: !room.timer,
                        roomId: room.id,
                      },
                      {
                        onSuccess() {
                          utils.main.getRoom
                            .invalidate({ slug: id })
                            .catch((e) => {
                              console.error(e);
                            });
                        },
                      },
                    );
                  }}
                >
                  {room.timer ? (
                    <MdPause size={16} />
                  ) : (
                    <MdPlayArrow size={16} />
                  )}
                </button>
              </div>
            )}
          </h4>
          {selectedTicket && (
            <div
              className={cn(
                "flex w-fit flex-col items-center justify-center gap-2 rounded-md px-2 pb-2 pt-1",
                {
                  "bg-info text-info-content": selectedTicket.type === "TASK",
                  "bg-error text-error-content": selectedTicket.type === "BUG",
                  "bg-success text-success-content":
                    selectedTicket.type === "STORY",
                  "bg-primary text-primary-content":
                    selectedTicket.type === "EPIC",
                },
              )}
            >
              <a
                href={selectedTicket.url}
                target="_blank"
                className="font-bold underline"
              >
                {selectedTicket.title}
              </a>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2">
                  {room.categories.map((category) => {
                    return (
                      <div
                        key={category.id}
                        className="flex items-center justify-between gap-2 rounded-md bg-base-300/25 p-2"
                      >
                        <span className="rounded-full bg-base-300 px-2 capitalize text-base-content">
                          {category.name}
                        </span>
                        {selectedTicket.voting && !isSpectator ? (
                          <div className="flex items-center justify-end gap-4">
                            {!!selectedTicket.votes.find(
                              (v) =>
                                v.userId === session.data?.user.id &&
                                v.categoryId === category.id,
                            ) && (
                              <span className="font-semibold">
                                {(() => {
                                  const myVote = selectedTicket.votes.find(
                                    (v) =>
                                      v.userId === session.data?.user.id &&
                                      v.categoryId === category.id,
                                  )!;
                                  const value = new Decimal(myVote.value);
                                  if (value.isNegative()) {
                                    if (value.eq(-1)) {
                                      return "?";
                                    } else {
                                      return <BiCoffee />;
                                    }
                                  }
                                  if (room.valueRange) {
                                    return value.toFixed(1);
                                  }
                                  const disp = room.values.find((d) => {
                                    return value.eq(d.value);
                                  });
                                  return disp?.display ?? value.toFixed(1);
                                })()}
                              </span>
                            )}
                            {room.valueRange ? (
                              <div className="flex items-center gap-2">
                                {room.enableQuestion &&
                                  (() => {
                                    const has = myVotes[category.id] === -1;
                                    const votedOn = selectedTicket.votes.some(
                                      (vote) => {
                                        return (
                                          vote.userId ===
                                            session.data?.user.id &&
                                          vote.categoryId === category.id &&
                                          new Decimal(vote.value).eq(-1)
                                        );
                                      },
                                    );
                                    return (
                                      <button
                                        key={"?"}
                                        className={cn("btn btn-sm", {
                                          "btn-primary": has && !votedOn,
                                          "btn-secondary": votedOn && !has,
                                          "btn-primary bg-gradient-to-br from-primary via-primary to-secondary":
                                            has && votedOn,
                                        })}
                                        onClick={() => {
                                          setMyVotes((prev) => {
                                            return {
                                              ...prev,
                                              [category.id]: -1,
                                            };
                                          });
                                        }}
                                      >
                                        ?
                                      </button>
                                    );
                                  })()}
                                {room.enableCoffee &&
                                  (() => {
                                    const has = myVotes[category.id] === -2;
                                    const votedOn = selectedTicket.votes.some(
                                      (vote) => {
                                        return (
                                          vote.userId ===
                                            session.data?.user.id &&
                                          vote.categoryId === category.id &&
                                          new Decimal(vote.value).eq(-2)
                                        );
                                      },
                                    );
                                    return (
                                      <button
                                        key={"coffee"}
                                        className={cn("btn btn-sm", {
                                          "btn-primary": has && !votedOn,
                                          "btn-secondary": votedOn && !has,
                                          "btn-primary bg-gradient-to-br from-primary via-primary to-secondary":
                                            has && votedOn,
                                        })}
                                        onClick={() => {
                                          setMyVotes((prev) => {
                                            return {
                                              ...prev,
                                              [category.id]: -2,
                                            };
                                          });
                                        }}
                                      >
                                        <BiCoffee />
                                      </button>
                                    );
                                  })()}
                                <input
                                  value={(() => {
                                    const out =
                                      myVotes[category.id] ??
                                      new Decimal(
                                        room.values.find(
                                          (v) => v.display === "min",
                                        )!.value,
                                      ).toNumber();
                                    if (out < 0) {
                                      return "";
                                    } else {
                                      return out;
                                    }
                                  })()}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (isNaN(value)) {
                                      return;
                                    }
                                    setMyVotes((prev) => {
                                      return {
                                        ...prev,
                                        [category.id]: value,
                                      };
                                    });
                                  }}
                                  className="input input-bordered text-base-content"
                                  type="number"
                                  min={new Decimal(
                                    room.values.find(
                                      (v) => v.display === "min",
                                    )!.value,
                                  ).toNumber()}
                                  max={new Decimal(
                                    room.values.find(
                                      (v) => v.display === "max",
                                    )!.value,
                                  ).toNumber()}
                                />
                              </div>
                            ) : (
                              <div className="flex max-w-[16rem] flex-wrap gap-2">
                                {room.values.map((v) => {
                                  const value = new Decimal(v.value);
                                  const has = value.eq(
                                    myVotes[category.id] ?? -3,
                                  );
                                  const votedOn = value.eq(
                                    selectedTicket.votes.find((vote) => {
                                      return (
                                        vote.userId === session.data?.user.id &&
                                        vote.categoryId === category.id
                                      );
                                    })?.value ?? -3,
                                  );
                                  return (
                                    <button
                                      key={v.id}
                                      className={cn("btn btn-sm", {
                                        "btn-primary": has && !votedOn,
                                        "btn-secondary": votedOn && !has,
                                        "btn-primary bg-gradient-to-br from-primary via-primary to-secondary":
                                          has && votedOn,
                                      })}
                                      onClick={() => {
                                        setMyVotes((prev) => {
                                          return {
                                            ...prev,
                                            [category.id]: value.toNumber(),
                                          };
                                        });
                                      }}
                                    >
                                      {v.display}
                                    </button>
                                  );
                                })}

                                {room.enableQuestion &&
                                  (() => {
                                    const has = myVotes[category.id] === -1;
                                    const votedOn = selectedTicket.votes.some(
                                      (vote) => {
                                        return (
                                          vote.userId ===
                                            session.data?.user.id &&
                                          vote.categoryId === category.id &&
                                          new Decimal(vote.value).eq(-1)
                                        );
                                      },
                                    );
                                    return (
                                      <button
                                        key={"?"}
                                        className={cn("btn btn-sm", {
                                          "btn-primary": has && !votedOn,
                                          "btn-secondary": votedOn && !has,
                                          "btn-primary bg-gradient-to-br from-primary via-primary to-secondary":
                                            has && votedOn,
                                        })}
                                        onClick={() => {
                                          setMyVotes((prev) => {
                                            return {
                                              ...prev,
                                              [category.id]: -1,
                                            };
                                          });
                                        }}
                                      >
                                        ?
                                      </button>
                                    );
                                  })()}
                                {room.enableCoffee &&
                                  (() => {
                                    const has = myVotes[category.id] === -2;
                                    const votedOn = selectedTicket.votes.some(
                                      (vote) => {
                                        return (
                                          vote.userId ===
                                            session.data?.user.id &&
                                          vote.categoryId === category.id &&
                                          new Decimal(vote.value).eq(-2)
                                        );
                                      },
                                    );
                                    return (
                                      <button
                                        key={"coffee"}
                                        className={cn("btn btn-sm", {
                                          "btn-primary": has && !votedOn,
                                          "btn-secondary": votedOn && !has,
                                          "btn-primary bg-gradient-to-br from-primary via-primary to-secondary":
                                            has && votedOn,
                                        })}
                                        onClick={() => {
                                          setMyVotes((prev) => {
                                            return {
                                              ...prev,
                                              [category.id]: -2,
                                            };
                                          });
                                        }}
                                      >
                                        <BiCoffee />
                                      </button>
                                    );
                                  })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedTicket.votes
                              .filter((vote) => vote.categoryId === category.id)
                              .map((vote) => {
                                const value = new Decimal(vote.value);
                                return (
                                  <div
                                    key={vote.id.toString()}
                                    className="tooltip flex items-center gap-1"
                                    data-tip={`${
                                      room.users.find(
                                        ({ user }) => user.id === vote.userId,
                                      )!.user.name
                                    } @ ${customDurationFormat(
                                      intervalToDuration({
                                        start: room.timerStart!,
                                        end: vote.updatedAt,
                                      }),
                                    )}`}
                                  >
                                    <UserAvatar
                                      user={
                                        room.users.find(
                                          ({ user }) => user.id === vote.userId,
                                        )!.user
                                      }
                                      presence={pusherMembers.includes(
                                        vote.userId,
                                      )}
                                    />
                                    <span className="font-bold">
                                      {(() => {
                                        if (value.isNegative()) {
                                          if (value.eq(-1)) {
                                            return "?";
                                          } else {
                                            return <BiCoffee />;
                                          }
                                        }
                                        if (room.valueRange) {
                                          return value.toFixed(1);
                                        }
                                        const disp = room.values.find((d) => {
                                          return value.eq(d.value);
                                        });
                                        return (
                                          disp?.display ?? value.toFixed(1)
                                        );
                                      })()}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!(selectedTicket.voting && !isSpectator) &&
                    !selectedTicket.votes.some((v) => {
                      return new Decimal(v.value).isNegative();
                    }) && (
                      <>
                        {Object.entries(algorithms).map(([algo, fn]) => {
                          const value = fn.votes(selectedTicket);
                          let nearest;
                          if (room.valueRange) {
                            nearest = value.toFixed(1);
                          } else {
                            let argmin = -1;
                            let argdel = new Decimal(0);
                            for (let i = 0; i < room.values.length; i++) {
                              const v = room.values[i]!.value;
                              if (argmin === -1) {
                                argmin = i;
                                argdel = value.sub(v).abs();
                              } else if (
                                argdel.greaterThan(value.sub(v).abs())
                              ) {
                                argmin = i;
                                argdel = value.sub(v).abs();
                              }
                            }
                            nearest =
                              room.values[argmin]?.display ?? value.toFixed(1);
                          }
                          return (
                            <div
                              key={algo}
                              className="flex items-center justify-between gap-2 rounded-md bg-base-300/25 p-2"
                            >
                              <span className="rounded-full bg-base-300 px-2 text-lg font-bold capitalize text-base-content">
                                {algo}
                              </span>

                              {room.valueRange ? (
                                <span className="font-bold">
                                  {value.toFixed(1)}
                                </span>
                              ) : (
                                <span className="font-bold">
                                  {nearest} ({value.toFixed(1)})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                </div>
                <div className="flex flex-wrap justify-center gap-2 rounded-md bg-base-100 p-2">
                  <button
                    className="btn"
                    disabled={
                      !(selectedTicket.voting && !isSpectator) ||
                      Object.keys(myVotes).length < room.categories.length
                    }
                    onClick={() => {
                      voteMutation.mutate(
                        {
                          ticketId: selectedTicket.id,
                          votes: room.categories.map((category) => {
                            const voteValue = myVotes[category.id] ?? 1;
                            return {
                              category: category.id,
                              value: voteValue,
                            };
                          }),
                        },
                        {
                          onSuccess() {
                            utils.main.getRoom
                              .invalidate({ slug: id })
                              .catch((e) => {
                                console.error(e);
                              });
                          },
                        },
                      );
                    }}
                  >
                    {voteMutation.isLoading ? (
                      <>
                        <span className="loading loading-spinner"></span>
                        Voting...
                      </>
                    ) : (
                      "Vote"
                    )}
                  </button>
                  {isOwner && (
                    <button
                      className="btn"
                      disabled={
                        selectedTicket.votes.length === 0 ||
                        selectedTicket.voting
                      }
                      onClick={() => {
                        clearVotesMutation.mutate(
                          {
                            ticketId: selectedTicket.id,
                            clear: "all",
                          },
                          {
                            onSuccess() {
                              setCanVoteMutation.mutate(
                                {
                                  canVote: true,
                                  ticketId: selectedTicket.id,
                                },
                                {
                                  onSuccess() {
                                    utils.main.getRoom
                                      .invalidate({ slug: id })
                                      .catch((e) => {
                                        console.error(e);
                                      });
                                  },
                                },
                              );
                            },
                          },
                        );
                      }}
                    >
                      {clearVotesMutation.isLoading ? (
                        <>
                          <span className="loading loading-spinner"></span>
                          Clearing...
                        </>
                      ) : (
                        "Clear Votes"
                      )}
                    </button>
                  )}
                  {isOwner && (
                    <button
                      className="btn"
                      onClick={() => {
                        setCanVoteMutation.mutate(
                          {
                            ticketId: selectedTicket.id,
                            canVote: !selectedTicket.voting,
                          },
                          {
                            onSuccess() {
                              utils.main.getRoom
                                .invalidate({ slug: id })
                                .catch((e) => {
                                  console.error(e);
                                });
                            },
                          },
                        );
                      }}
                    >
                      {setCanVoteMutation.isLoading ? (
                        <>
                          <span className="loading loading-spinner"></span>
                          Updating Voting...
                        </>
                      ) : selectedTicket.voting ? (
                        "Disable Voting"
                      ) : (
                        "Enable Voting"
                      )}
                    </button>
                  )}
                  {isOwner && (
                    <button
                      className="btn"
                      disabled={
                        selectedTicket.votes.length === 0 ||
                        selectedTicket.voting ||
                        selectedTicket.votes.some((v) => {
                          return new Decimal(v.value).isNegative();
                        })
                      }
                      onClick={() => {
                        const now = new Date();
                        utils.main.getRoom.setData(
                          { slug: room.slug },
                          (prev) => {
                            if (!prev) {
                              return prev;
                            }
                            return {
                              ...prev,
                              timer: false,
                              timerStart: now,
                              timerEnd: now,
                            };
                          },
                        );
                        updateTimer.mutate({
                          roomId: room.id,
                          running: false,
                          start: now,
                          stop: now,
                        });
                        completeTicketMutation.mutate(
                          {
                            ticketId: selectedTicket.id,
                          },
                          {
                            onSuccess() {
                              utils.main.getRoom
                                .invalidate({ slug: id })
                                .catch((e) => {
                                  console.error(e);
                                });
                            },
                          },
                        );
                      }}
                    >
                      {completeTicketMutation.isLoading ? (
                        <>
                          <span className="loading loading-spinner"></span>
                          Completing...
                        </>
                      ) : (
                        "Complete Ticket"
                      )}
                    </button>
                  )}
                  {isOwner && (
                    <button
                      className="btn"
                      onClick={() => {
                        rejectTicketMutation.mutate(
                          {
                            ticketId: selectedTicket.id,
                          },
                          {
                            onSuccess() {
                              utils.main.getRoom
                                .invalidate({ slug: id })
                                .catch((e) => {
                                  console.error(e);
                                });
                            },
                          },
                        );
                      }}
                    >
                      {rejectTicketMutation.isLoading ? (
                        <>
                          <span className="loading loading-spinner"></span>
                          Rejecting...
                        </>
                      ) : (
                        "Reject Ticket"
                      )}
                    </button>
                  )}
                  {isOwner && (
                    <button
                      className="btn"
                      disabled={
                        selectedTicket.votes.length === 0 ||
                        selectedTicket.voting ||
                        selectedTicket.votes.some((v) => {
                          return new Decimal(v.value).isNegative();
                        })
                      }
                      onClick={() => {
                        setOnOverrideComplete(() => (v: number) => {
                          const now = new Date();
                          utils.main.getRoom.setData(
                            { slug: room.slug },
                            (prev) => {
                              if (!prev) {
                                return prev;
                              }
                              return {
                                ...prev,
                                timer: false,
                                timerStart: now,
                                timerEnd: now,
                              };
                            },
                          );
                          updateTimer.mutate({
                            roomId: room.id,
                            running: false,
                            start: now,
                            stop: now,
                          });
                          completeTicketMutation.mutate(
                            {
                              ticketId: selectedTicket.id,
                              overrideValue: v,
                            },
                            {
                              onSuccess() {
                                utils.main.getRoom
                                  .invalidate({ slug: id })
                                  .catch((e) => {
                                    console.error(e);
                                  });
                              },
                            },
                          );
                        });
                      }}
                    >
                      {completeTicketMutation.isLoading ? (
                        <>
                          <span className="loading loading-spinner"></span>
                          Completing ticket...
                        </>
                      ) : (
                        "Manual Value"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </ADiv>

        <ADiv className="relative order-4 flex h-fit w-fit flex-col gap-2 rounded-xl border border-accent p-4">
          <h3 className="pb-2 text-center">Complete tickets</h3>
          {room.tickets.some((ticket) => ticket.done && !ticket.rejected) && (
            <div className="absolute right-0 top-0 p-4">
              <button
                onClick={() => setExportOpen(true)}
                className="btn btn-circle btn-info btn-sm text-info-content"
                aria-label="export"
              >
                <PiExport size={16} />
              </button>
              <ExportTicketsModal
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                roomSlug={room.slug}
              />
            </div>
          )}
          <div
            key={"total"}
            className={cn(
              "flex flex-col items-center gap-2 rounded-md border-2 border-primary px-2 pb-2 pt-1",
            )}
          >
            <div className="flex w-full justify-between">
              <span className="font-bold underline">Total</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {room.categories.map((category) => {
                const value = room.tickets
                  .map((ticket) =>
                    ticket.overrideValue !== null
                      ? { value: ticket.overrideValue }
                      : ticket.results.find(
                          (result) => result.categoryId === category.id,
                        ),
                  )
                  .reduce((acc, result) => {
                    return acc.add(new Decimal(result?.value ?? 0));
                  }, new Decimal(0));
                return (
                  <ADiv
                    key={category.id}
                    className=" flex flex-col gap-2 rounded-md border border-secondary bg-base-300/25 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-base-300 px-2 capitalize text-base-content">
                        {category.name}
                      </span>
                      <span className="font-semibold">
                        {(() => {
                          if (value.isNegative()) {
                            if (value.eq(-1)) {
                              return "?";
                            } else {
                              return <BiCoffee />;
                            }
                          }
                          if (room.valueRange) {
                            return value.toFixed(1);
                          }
                          const disp = room.values.find((d) => {
                            return value.eq(d.value);
                          });
                          return disp?.display ?? value.toFixed(1);
                        })()}
                      </span>
                    </div>
                  </ADiv>
                );
              })}
              {Object.entries(algorithms).map(([algo, fn]) => {
                const value = room.tickets
                  .map((ticket) => fn.results(ticket))
                  .reduce((acc, result) => {
                    return acc.add(new Decimal(result));
                  }, new Decimal(0));
                let nearest;
                if (room.valueRange) {
                  nearest = value.toFixed(1);
                } else {
                  let argmin = -1;
                  let argdel = new Decimal(0);
                  for (let i = 0; i < room.values.length; i++) {
                    const v = room.values[i]!.value;
                    if (argmin === -1) {
                      argmin = i;
                      argdel = value.sub(v).abs();
                    } else if (argdel.greaterThan(value.sub(v).abs())) {
                      argmin = i;
                      argdel = value.sub(v).abs();
                    }
                  }
                  nearest = room.values[argmin]?.display ?? value.toFixed(1);
                }
                return (
                  <div
                    key={algo}
                    className="flex items-center justify-between gap-2 rounded-md border border-secondary bg-base-300/25 p-2"
                  >
                    <span className="rounded-full bg-base-300 px-2 text-lg font-bold capitalize text-base-content">
                      {algo}
                    </span>

                    {room.valueRange ? (
                      <span className="font-bold">{value.toFixed(1)}</span>
                    ) : (
                      <span className="font-bold">
                        {nearest} ({value.toFixed(1)})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {room.tickets
            .filter((ticket) => ticket.done)
            .map((ticket) => {
              return (
                <div
                  key={ticket.ticketId}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-md px-2 pb-2 pt-1",
                    {
                      "bg-info text-info-content": ticket.type === "TASK",
                      "bg-error text-error-content": ticket.type === "BUG",
                      "bg-success text-success-content":
                        ticket.type === "STORY",
                      "bg-primary text-primary-content": ticket.type === "EPIC",
                    },
                  )}
                >
                  <div className="flex w-full justify-between">
                    <a
                      href={ticket.url}
                      target="_blank"
                      className={cn("font-bold underline", {
                        "line-through": ticket.rejected,
                      })}
                    >
                      {ticket.title}
                    </a>
                    <div className="tooltip" data-tip="More info">
                      <button
                        className="btn btn-circle btn-ghost btn-xs"
                        onClick={() => {
                          setCompletedTicketShowMore((old) => {
                            if (old.includes(ticket.id)) {
                              return old.filter(
                                (ticketId) => ticketId !== ticket.id,
                              );
                            } else {
                              return [...old, ticket.id];
                            }
                          });
                        }}
                      >
                        <MdAdd
                          size={16}
                          className={cn("transition-transform", {
                            "rotate-45": completedTicketShowMore.includes(
                              ticket.id,
                            ),
                          })}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.categories.map((category) => {
                      const result =
                        ticket.overrideValue !== null
                          ? { value: ticket.overrideValue }
                          : ticket.results.find(
                              (result) => result.categoryId === category.id,
                            );
                      if (!result) {
                        return null;
                      }
                      const value = new Decimal(result.value);
                      return (
                        <ADiv
                          key={category.id}
                          className=" flex flex-col gap-2 rounded-md bg-base-300/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-base-300 px-2 capitalize text-base-content">
                              {category.name}
                            </span>
                            <div
                              data-tip="Ticket value has been manually set"
                              className={cn({
                                tooltip: ticket.overrideValue !== null,
                              })}
                            >
                              <span className="font-semibold">
                                {(() => {
                                  if (value.isNegative()) {
                                    if (value.eq(-1)) {
                                      return "?";
                                    } else {
                                      return <BiCoffee />;
                                    }
                                  }
                                  if (room.valueRange) {
                                    return value.toFixed(1);
                                  }
                                  const disp = room.values.find((d) => {
                                    return value.eq(d.value);
                                  });
                                  return disp?.display ?? value.toFixed(1);
                                })()}
                                {ticket.overrideValue !== null && "*"}
                              </span>
                            </div>
                          </div>
                          {completedTicketShowMore.includes(ticket.id) && (
                            <div className="flex flex-wrap gap-2">
                              {ticket.votes
                                .filter(
                                  (vote) => vote.categoryId === category.id,
                                )
                                .map((vote) => {
                                  const value = new Decimal(vote.value);
                                  return (
                                    <div
                                      key={vote.id.toString()}
                                      className="tooltip flex items-center gap-1"
                                      data-tip={
                                        room.users.find(
                                          ({ user }) => user.id === vote.userId,
                                        )!.user.name
                                      }
                                    >
                                      <UserAvatar
                                        user={
                                          room.users.find(
                                            ({ user }) =>
                                              user.id === vote.userId,
                                          )!.user
                                        }
                                        presence={pusherMembers.includes(
                                          vote.userId,
                                        )}
                                      />
                                      <span className="font-bold">
                                        {(() => {
                                          if (value.isNegative()) {
                                            if (value.eq(-1)) {
                                              return "?";
                                            } else {
                                              return <BiCoffee />;
                                            }
                                          }
                                          if (room.valueRange) {
                                            return value.toFixed(1);
                                          }
                                          const disp = room.values.find((d) => {
                                            return value.eq(d.value);
                                          });
                                          return (
                                            disp?.display ?? value.toFixed(1)
                                          );
                                        })()}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </ADiv>
                      );
                    })}
                    {!ticket.rejected &&
                      Object.entries(algorithms).map(([algo, fn]) => {
                        const value = fn.results(ticket);
                        let nearest;
                        if (room.valueRange) {
                          nearest = value.toFixed(1);
                        } else {
                          let argmin = -1;
                          let argdel = new Decimal(0);
                          for (let i = 0; i < room.values.length; i++) {
                            const v = room.values[i]!.value;
                            if (argmin === -1) {
                              argmin = i;
                              argdel = value.sub(v).abs();
                            } else if (argdel.greaterThan(value.sub(v).abs())) {
                              argmin = i;
                              argdel = value.sub(v).abs();
                            }
                          }
                          nearest =
                            room.values[argmin]?.display ?? value.toFixed(1);
                        }
                        return (
                          <div
                            key={algo}
                            className="flex items-center justify-between gap-2 rounded-md bg-base-300/25 p-2"
                          >
                            <span className="rounded-full bg-base-300 px-2 text-lg font-bold capitalize text-base-content">
                              {algo}
                            </span>

                            <div
                              data-tip="Ticket value has been manually set"
                              className={cn({
                                tooltip: ticket.overrideValue !== null,
                              })}
                            >
                              <span className="font-bold">
                                {room.valueRange
                                  ? value.toFixed(1)
                                  : `${nearest} (${value.toFixed(1)})`}
                                {ticket.overrideValue !== null && "*"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
        </ADiv>
      </div>

      <AddTicketsModal
        roomId={room.id}
        roomSlug={room.slug}
        open={addTicketsOpen}
        onClose={() => setAddTicketsOpen(false)}
      />
    </div>
  );
}

export default function AuthRoomWrapper(props: RoomProps) {
  const session = useSession();
  const router = useRouter();
  if (session.status === "loading") {
    return null;
  }
  if (session.status === "unauthenticated" || !session.data) {
    router.push("/").catch(console.error);
    return <div>unauthenticated</div>;
  }

  return <Room {...props} />;
}
