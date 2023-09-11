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
  MdOutlineClose,
} from "react-icons/md";
import { serverSideHelpers } from "~/server/api/ssr";
import Link from "next/link";

type User = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  currentRoomId: number | null;
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

  const [pusherMembers, setPusherMembers] = useState<string[]>([]);

  const handlePusherEvent = useCallback((event: string, data: unknown) => {
    console.log(event, data);
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
        break;
      }
      // TODO these could be smarter since they have the necessary data
      case "newTickets":
      case "updateVotes":
      case "selectTicket":
      case "completeTicket":
      case "setCanVote":
      case "updateVotes":
      case "clearVotes":
      case "deleteTickets":
        utils.main.getRoom.invalidate({ slug: id }).catch(console.error);
        break;
      case "deleteRoom": {
        router.push("/").catch(console.error);
      }
      default:
        break;
    }
  }, [id, router, utils]);

  useEffect(() => {
    if (channel) {
      channel.bind_global(handlePusherEvent);
      return () => {
        channel.unbind_global(handlePusherEvent);
      };
    }
  }, [channel, handlePusherEvent]);

  const [addTicketsOpen, setAddTicketsOpen] = useState(false);
  const session = useSession();

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
          className={cn("", {
            "tooltip tooltip-bottom tooltip-open": showCopyMsg,
          })}
          data-tip="Copied!"
        >
          <button
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              navigator.clipboard.writeText(room.slug).catch(console.error);
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
                className="flex w-fit items-center gap-2 rounded-xl bg-neutral-focus px-2 py-1"
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
                          <div className="flex items-center gap-2">
                            <input
                              value={myVotes[category.id] ?? 1}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (isNaN(value)) {
                                  return;
                                }
                                setMyVotes((prev) => {
                                  return {
                                    ...prev,
                                    [category.id]: Math.min(
                                      Math.max(1, value),
                                      10,
                                    ),
                                  };
                                });
                              }}
                              className="input input-bordered text-neutral-content"
                              type="number"
                              min="1"
                              max="10"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedTicket.votes
                              .filter((vote) => vote.categoryId === category.id)
                              .map((vote) => {
                                return (
                                  <div
                                    key={vote.id.toString()}
                                    className="flex items-center gap-1"
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
                                      {vote.value}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!selectedTicket.voting && (
                    <>
                      <div
                        key={"total"}
                        className="tooltip flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                        data-tip="Average"
                      >
                        <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
                          Average
                        </span>

                        <span className="font-bold">
                          {(
                            selectedTicket.votes.reduce((acc, r) => {
                              return acc + r.value;
                            }, 0) / selectedTicket.votes.length
                          ).toFixed(1)}
                        </span>
                      </div>
                      <div
                        key={"geom"}
                        className="tooltip flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                        data-tip="Geometric Average"
                      >
                        <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
                          Geometric
                        </span>

                        <span className="font-bold">
                          {selectedTicket.votes.reduce((acc, r) => {
                            return acc * r.value;
                          }, 1)}
                        </span>
                      </div>
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
                        selectedTicket.voting
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
                  <a
                    href={ticket.url}
                    target="_blank"
                    className="font-bold underline"
                  >
                    {ticket.title}
                  </a>
                  <div className="flex flex-wrap gap-2">
                    {room.categories.map((category) => {
                      const result = ticket.results.find(
                        (result) => result.categoryId === category.id,
                      );
                      return (
                        <div
                          key={category.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                        >
                          <span className="rounded-full bg-neutral-focus px-2 capitalize text-neutral-content">
                            {category.name}
                          </span>

                          <span className="font-semibold">
                            {result?.value ?? 0}
                          </span>
                        </div>
                      );
                    })}
                    <div
                      key={"total"}
                      className="tooltip tooltip-bottom flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                      data-tip="Average"
                    >
                      <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
                        Average
                      </span>

                      <span className="font-bold">
                        {(
                          ticket.results.reduce((acc, r) => {
                            return acc + r.value;
                          }, 0) / ticket.results.length
                        ).toFixed(1)}
                      </span>
                    </div>
                    <div
                      key={"geom"}
                      className="tooltip tooltip-bottom flex items-center justify-between gap-2 rounded-md bg-neutral-focus/25 p-2"
                      data-tip="Geometric Average"
                    >
                      <span className="rounded-full bg-neutral-focus px-2 text-lg font-bold capitalize text-neutral-content">
                        Geometric
                      </span>

                      <span className="font-bold">
                        {ticket.results.reduce((acc, r) => {
                          return acc * r.value;
                        }, 1)}
                      </span>
                    </div>
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