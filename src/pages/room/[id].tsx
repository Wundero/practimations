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
import { FaCrown } from "react-icons/fa";
import AddTicketsModal from "~/components/addTicketsModal";
import type { TicketType } from "@prisma/client";
import {
  MdAdd,
  MdCheck,
  MdContentCopy,
  MdHome,
  MdHourglassBottom,
  MdOutlineClose,
} from "react-icons/md";
import { serverSideHelpers } from "~/server/api/ssr";
import Link from "next/link";
import type { Event, Data } from "~/server/integrations/pusher";
import superjson from "superjson";
import algorithms from "~/utils/math";
import { BiCoffee } from "react-icons/bi";
import Decimal from "decimal.js";

type User = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
};

type Ticket = {
  id: number;
  ticketId: string;
  title: string;
  url: string;
  type: TicketType;
  roomId: number;
};

type Category = {
  id: number;
  name: string;
  roomId: number;
};

type Room = {
  id: number;
  name: string;
  slug: string;
  ownerId: string;
  tickets: Ticket[];
  categories: Category[];
  users: User[];
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce(fn: (...args: any[]) => any, delay: number) {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: unknown[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
function UserAvatar({ user, presence }: { user: User; presence?: boolean }) {
  if (!user.image) {
    return (
      <div
        className={cn("avatar placeholder", {
          online: presence,
          offline: !presence,
        })}
      >
        <div className="w-8 rounded-full bg-neutral-focus text-neutral-content">
          <span className="text-sm">{user.name?.[0] ?? "?"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("avatar", {
        online: presence,
        offline: !presence,
      })}
    >
      <div className="w-8 rounded-full">
        <img src={user.image} alt={user.name ?? "Unknown User"} />
      </div>
    </div>
  );
}

type PusherMember = {
  name: string;
  image: string;
};

function Room({ id }: RoomProps) {
  const channel = usePusherChannel(`presence-${id}`);

  const router = useRouter();

  const utils = api.useContext();

  // List of present user ids for presence detection stuff
  const [pusherMembers, setPusherMembers] = useState<string[]>([]);
  const session = useSession();

  const handlePusherEvent = useCallback(
    (event: string, data: unknown) => {
      if (process.env.NODE_ENV === "development") {
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
                  id: dx.id,
                  name: dx.info.name,
                  image: dx.info.image,
                  email: null,
                  emailVerified: null,
                  currentRoomId: prev.id,
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
        case "userLeave": {
          const { eventData } = ed as Data<"userLeave">;
          utils.main.getRoom.setData({ slug: id }, (prev) => {
            if (!prev) {
              return prev;
            }
            return {
              ...prev,
              users: prev.users.filter((user) => user.id !== eventData.user),
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
                  };
                } else {
                  return {
                    ...ticket,
                    selected: false,
                  };
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
                    results: eventData.results,
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
          break;
      }
      utils.main.getRoom.invalidate({ slug: id }).catch(console.error);
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

  const deleteTicketMutation = api.main.removeTickets.useMutation();
  const selectTicketMutation = api.main.selectTicket.useMutation();
  const completeTicketMutation = api.main.completeTicket.useMutation();
  const voteMutation = api.main.vote.useMutation();
  const clearVotesMutation = api.main.clearVotes.useMutation();
  const setCanVoteMutation = api.main.setCanVote.useMutation();

  const [myVotes, setMyVotes] = useState<Record<number, number>>(
    selectedTicket
      ? selectedTicket.votes
          .filter((v) => v.userId === session.data?.user.id)
          .reduce((acc, vote) => {
            return {
              ...acc,
              [vote.categoryId]: vote.value,
            };
          }, {})
      : {},
  );

  const isOwner = useMemo(() => {
    return session.data?.user.id === room?.ownerId;
  }, [room, session]);

  const [showCopyMsg, setShowCopyMsg] = useState(false);

  const debouncedSetShowCopyMsg = useMemo(() => {
    return debounce((v: boolean) => setShowCopyMsg(v), 1000);
  }, [setShowCopyMsg]);

  const [completedTicketShowMore, setCompletedTicketShowMore] = useState<
    number[]
  >([]);

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
      <h1 className="flex items-center justify-center gap-2 p-4 text-center text-3xl font-extrabold">
        {room.name}
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
      </h1>
      <div className="flex flex-wrap justify-around gap-2 pt-2">
        <div className="flex h-fit w-fit flex-col gap-2 rounded-xl border border-accent p-4">
          <span className="text-center text-lg font-bold">Users</span>
          {room.users.map((user) => {
            return (
              <div
                className="flex w-fit items-center gap-2 rounded-xl bg-neutral-focus px-2 py-1 text-neutral-content"
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
                {!!selectedTicket &&
                  selectedTicket.votes.filter((vote) => vote.userId === user.id)
                    .length > 0 && <MdCheck className="text-success" />}
                {!!selectedTicket &&
                  selectedTicket.votes.filter((vote) => vote.userId === user.id)
                    .length === 0 && (
                    <MdHourglassBottom className="text-neutral-content" />
                  )}
              </div>
            );
          })}
        </div>
        <div className="flex h-fit  w-fit flex-col gap-2 rounded-xl border border-accent p-4">
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
                        utils.main.getRoom.setData(
                          { slug: room.slug },
                          (prev) => {
                            if (!prev) {
                              return prev;
                            }
                            return {
                              ...prev,
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
                                acc[category.id] = room.values
                                  .find((v) => v.display === "min")!
                                  .value.toNumber();
                              } else {
                                acc[category.id] = room.values
                                  .sort((a, b) =>
                                    a.value.comparedTo(b.value),
                                  )[0]!
                                  .value.toNumber();
                              }
                              return acc;
                            },
                            {} as Record<number, number>,
                          ),
                        );
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
        </div>

        <div className="flex h-fit w-fit  flex-col gap-2 rounded-xl border border-accent p-4">
          <h3 className="text-center">Current Ticket:</h3>
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
                        className="flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                      >
                        <span className="rounded-full bg-neutral-focus px-2 capitalize text-neutral-content">
                          {category.name}
                        </span>
                        {selectedTicket.voting ? (
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
                                  if (myVote.value.isNegative()) {
                                    if (myVote.value.eq(-1)) {
                                      return "?";
                                    } else {
                                      return <BiCoffee />;
                                    }
                                  }
                                  if (room.valueRange) {
                                    return myVote.value.toFixed(1);
                                  }
                                  const disp = room.values.find((d) => {
                                    return d.value.eq(myVote.value);
                                  });
                                  return (
                                    disp?.display ?? myVote.value.toFixed(1)
                                  );
                                })()}
                              </span>
                            )}
                            {room.valueRange ? (
                              <div className="flex items-center gap-2">
                                {room.enableQuestion && (
                                  <button
                                    key={"?"}
                                    className={cn("btn btn-sm", {
                                      "btn-primary":
                                        myVotes[category.id] === -1,
                                      "btn-secondary":
                                        selectedTicket.votes.some((vote) => {
                                          return (
                                            vote.userId ===
                                              session.data?.user.id &&
                                            vote.categoryId === category.id &&
                                            vote.value.eq(-1)
                                          );
                                        }) && myVotes[category.id] !== -1,
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
                                )}
                                {room.enableCoffee && (
                                  <button
                                    key={"coffee"}
                                    className={cn("btn btn-sm", {
                                      "btn-primary":
                                        myVotes[category.id] === -2,
                                      "btn-secondary":
                                        selectedTicket.votes.some((vote) => {
                                          return (
                                            vote.userId ===
                                              session.data?.user.id &&
                                            vote.categoryId === category.id &&
                                            vote.value.eq(-2)
                                          );
                                        }) && myVotes[category.id] !== -2,
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
                                )}
                                <input
                                  value={(() => {
                                    const out =
                                      myVotes[category.id] ??
                                      room.values
                                        .find((v) => v.display === "min")!
                                        .value.toNumber();
                                    if (out < 0) {
                                      return "";
                                    } else {
                                      return out;
                                    }
                                  })()}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
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
                                  className="input input-bordered text-black dark:text-neutral-content"
                                  type="number"
                                  min={room.values
                                    .find((v) => v.display === "min")!
                                    .value.toNumber()}
                                  max={room.values
                                    .find((v) => v.display === "max")!
                                    .value.toNumber()}
                                />
                              </div>
                            ) : (
                              <div className="flex max-w-[16rem] flex-wrap gap-2">
                                {room.values.map((v) => {
                                  return (
                                    <button
                                      key={v.id}
                                      className={cn("btn btn-sm", {
                                        "btn-primary": v.value.eq(
                                          myVotes[category.id] ?? -3,
                                        ),
                                        "btn-secondary":
                                          v.value.eq(
                                            selectedTicket.votes.find(
                                              (vote) => {
                                                return (
                                                  vote.userId ===
                                                    session.data?.user.id &&
                                                  vote.categoryId ===
                                                    category.id
                                                );
                                              },
                                            )?.value ?? -3,
                                          ) &&
                                          !v.value.eq(
                                            myVotes[category.id] ?? -3,
                                          ),
                                      })}
                                      onClick={() => {
                                        setMyVotes((prev) => {
                                          return {
                                            ...prev,
                                            [category.id]: v.value.toNumber(),
                                          };
                                        });
                                      }}
                                    >
                                      {v.display}
                                    </button>
                                  );
                                })}

                                {room.enableQuestion && (
                                  <button
                                    key={"?"}
                                    className={cn("btn btn-sm", {
                                      "btn-primary":
                                        myVotes[category.id] === -1,
                                      "btn-secondary":
                                        selectedTicket.votes.some((vote) => {
                                          return (
                                            vote.userId ===
                                              session.data?.user.id &&
                                            vote.categoryId === category.id &&
                                            vote.value.eq(-1)
                                          );
                                        }) && myVotes[category.id] !== -1,
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
                                )}
                                {room.enableCoffee && (
                                  <button
                                    key={"coffee"}
                                    className={cn("btn btn-sm", {
                                      "btn-primary":
                                        myVotes[category.id] === -2,
                                      "btn-secondary":
                                        selectedTicket.votes.some((vote) => {
                                          return (
                                            vote.userId ===
                                              session.data?.user.id &&
                                            vote.categoryId === category.id &&
                                            vote.value.eq(-2)
                                          );
                                        }) && myVotes[category.id] !== -2,
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
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedTicket.votes
                              .filter((vote) => vote.categoryId === category.id)
                              .map((vote) => {
                                return (
                                  <div
                                    key={vote.id.toString()}
                                    className="tooltip flex items-center gap-1"
                                    data-tip={
                                      room.users.find(
                                        (user) => user.id === vote.userId,
                                      )!.name
                                    }
                                  >
                                    <UserAvatar
                                      user={
                                        room.users.find(
                                          (user) => user.id === vote.userId,
                                        )!
                                      }
                                      presence={pusherMembers.includes(
                                        vote.userId,
                                      )}
                                    />
                                    <span className="font-bold">
                                      {(() => {
                                        if (vote.value.isNegative()) {
                                          if (vote.value.eq(-1)) {
                                            return "?";
                                          } else {
                                            return <BiCoffee />;
                                          }
                                        }
                                        if (room.valueRange) {
                                          return vote.value.toFixed(1);
                                        }
                                        const disp = room.values.find((d) => {
                                          return d.value.eq(vote.value);
                                        });
                                        return (
                                          disp?.display ?? vote.value.toFixed(1)
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
                  {!selectedTicket.voting &&
                    !selectedTicket.votes.some((v) => {
                      return v.value.isNegative();
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
                                argdel = v.sub(value).abs();
                              } else if (
                                argdel.greaterThan(v.sub(value).abs())
                              ) {
                                argmin = i;
                                argdel = v.sub(value).abs();
                              }
                            }
                            nearest =
                              room.values[argmin]?.display ?? value.toFixed(1);
                          }
                          return (
                            <div
                              key={algo}
                              className="flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                            >
                              <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
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
                <div className="flex justify-center gap-2 rounded-md bg-neutral p-2">
                  <button
                    className="btn"
                    disabled={!selectedTicket.voting}
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
                          return v.value.isNegative();
                        })
                      }
                      onClick={() => {
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
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex h-fit  w-fit flex-col gap-2 rounded-xl border border-accent p-4">
          <h3 className="text-center">Complete tickets</h3>
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
                  <div className="flex gap-3">
                    <a
                      href={ticket.url}
                      target="_blank"
                      className="font-bold underline"
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
                      const result = ticket.results.find(
                        (result) => result.categoryId === category.id,
                      );
                      if (!result) {
                        return null;
                      }
                      return (
                        <div
                          key={category.id}
                          className=" flex flex-col gap-2 rounded-md bg-neutral-focus/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-neutral-focus px-2 capitalize text-neutral-content">
                              {category.name}
                            </span>
                            <span className="font-semibold">
                              {(() => {
                                if (result.value.isNegative()) {
                                  if (result.value.eq(-1)) {
                                    return "?";
                                  } else {
                                    return <BiCoffee />;
                                  }
                                }
                                if (room.valueRange) {
                                  return result.value.toFixed(1);
                                }
                                const disp = room.values.find((d) => {
                                  return d.value.eq(result.value);
                                });
                                return disp?.display ?? result.value.toFixed(1);
                              })()}
                            </span>
                          </div>
                          {completedTicketShowMore.includes(ticket.id) && (
                            <div className="flex flex-wrap gap-2">
                              {ticket.votes
                                .filter(
                                  (vote) => vote.categoryId === category.id,
                                )
                                .map((vote) => {
                                  return (
                                    <div
                                      key={vote.id.toString()}
                                      className="tooltip flex items-center gap-1"
                                      data-tip={
                                        room.users.find(
                                          (user) => user.id === vote.userId,
                                        )!.name
                                      }
                                    >
                                      <UserAvatar
                                        user={
                                          room.users.find(
                                            (user) => user.id === vote.userId,
                                          )!
                                        }
                                        presence={pusherMembers.includes(
                                          vote.userId,
                                        )}
                                      />
                                      <span className="font-bold">
                                        {(() => {
                                          if (vote.value.isNegative()) {
                                            if (vote.value.eq(-1)) {
                                              return "?";
                                            } else {
                                              return <BiCoffee />;
                                            }
                                          }
                                          if (room.valueRange) {
                                            return vote.value.toFixed(1);
                                          }
                                          const disp = room.values.find((d) => {
                                            return d.value.eq(vote.value);
                                          });
                                          return (
                                            disp?.display ??
                                            vote.value.toFixed(1)
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
                    {Object.entries(algorithms).map(([algo, fn]) => {
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
                            argdel = v.sub(value).abs();
                          } else if (argdel.greaterThan(v.sub(value).abs())) {
                            argmin = i;
                            argdel = v.sub(value).abs();
                          }
                        }
                        nearest =
                          room.values[argmin]?.display ?? value.toFixed(1);
                      }
                      return (
                        <div
                          key={algo}
                          className="flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                        >
                          <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
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
                  </div>
                </div>
              );
            })}
        </div>
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
