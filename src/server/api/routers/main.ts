import { Decimal } from "decimal.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

function getChannelName(roomSlug: string) {
  return `presence-${roomSlug}`;
}

export const mainRouter = createTRPCRouter({
  authenticateUser: protectedProcedure
    .input(
      z.object({
        socketId: z.string(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { pusher, session } = ctx;
      return pusher.authenticateUser(input.socketId, {
        id: session.user.id,
        user_info: {
          name: session.user.name,
          image: session.user.image,
        },
      });
    }),
  authorizeUserForRoom: protectedProcedure
    .input(z.object({ socketId: z.string(), channelName: z.string() }))
    .mutation(({ input, ctx }) => {
      const { pusher, session } = ctx;
      return pusher.authorizeChannel(input.socketId, input.channelName, {
        user_id: session.user.id,
        user_info: {
          name: session.user.name,
          image: session.user.image,
        },
      });
    }),
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const { prisma, session } = ctx;
    await prisma.result.deleteMany({
      where: {
        ticket: {
          room: {
            ownerId: session.user.id,
          },
        },
      },
    });
    await prisma.vote.deleteMany({
      where: {
        OR: [
          {
            userId: session.user.id,
          },
          {
            ticket: {
              room: {
                ownerId: session.user.id,
              },
            },
          },
        ],
      },
    });
    await prisma.roomPointValue.deleteMany({
      where: {
        room: {
          ownerId: session.user.id,
        },
      },
    });
    await prisma.category.deleteMany({
      where: {
        room: {
          ownerId: session.user.id,
        },
      },
    });
    await prisma.ticket.deleteMany({
      where: {
        room: {
          ownerId: session.user.id,
        },
      },
    });
    await prisma.roomMember.deleteMany({
      where: {
        userId: session.user.id,
      },
    });
    await prisma.room.deleteMany({
      where: {
        ownerId: session.user.id,
      },
    });
    await prisma.user.delete({
      where: {
        id: session.user.id,
      },
    });
    return true;
  }),
  unlinkAccount: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { prisma, session } = ctx;
      const existingAccounts = await prisma.account.findMany({
        where: {
          userId: session.user.id,
        },
      });
      if (existingAccounts.length <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot unlink last account",
        });
      }
      if (!existingAccounts.some((a) => a.provider === input.provider)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not linked",
        });
      }
      await prisma.account.deleteMany({
        where: {
          userId: session.user.id,
          provider: input.provider,
        },
      });
      return true;
    }),
  createRoom: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        categories: z.array(z.string()),
        maxMembers: z.number().min(2).max(100).default(100),
        inputs: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("range"),
            min: z.number().min(0).max(99),
            max: z.number().max(100).min(1),
          }),
          z.object({
            type: z.literal("list"),
            values: z
              .array(
                z.object({
                  value: z.number().min(0).max(100),
                  label: z.string(),
                }),
              )
              .min(1)
              .max(15),
          }),
        ]),
        specialInputs: z.object({
          coffee: z.boolean().nullable(),
          question: z.boolean().nullable(),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, session } = ctx;
      const room = await prisma.room.create({
        data: {
          name: input.name,
          maxMembers: input.maxMembers,
          enableCoffee: input.specialInputs.coffee ?? true,
          enableQuestion: input.specialInputs.question ?? true,
          categories: {
            createMany: {
              data: input.categories.map((category) => ({
                name: category,
              })),
            },
          },
          valueRange: input.inputs.type === "range",
          values:
            input.inputs.type === "range"
              ? {
                  createMany: {
                    data: [
                      {
                        display: "min",
                        value: input.inputs.min,
                      },
                      {
                        display: "max",
                        value: input.inputs.max,
                      },
                    ],
                  },
                }
              : {
                  createMany: {
                    data: input.inputs.values.map((value) => {
                      return {
                        display: value.label,
                        value: value.value,
                      };
                    }),
                  },
                },
          users: {
            create: {
              userId: session.user.id,
            },
          },
          owner: {
            connect: {
              id: session.user.id,
            },
          },
        },
      });
      return room;
    }),
  editRoom: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string(),
        maxMembers: z.number().min(2).max(100).default(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { prisma } = ctx;
      const room = await prisma.room.update({
        where: {
          slug: input.slug,
        },
        data: {
          name: input.name,
          maxMembers: input.maxMembers,
        },
      });
      return room;
    }),
  deleteRoom: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          slug: input.slug,
          ownerId: session.user.id,
        },
        include: {
          categories: true,
          tickets: true,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      await prisma.vote.deleteMany({
        where: {
          ticketId: {
            in: room.tickets.map((t) => t.id),
          },
        },
      });
      await prisma.result.deleteMany({
        where: {
          ticketId: {
            in: room.tickets.map((t) => t.id),
          },
        },
      });
      await prisma.ticket.deleteMany({
        where: {
          roomId: room.id,
        },
      });
      await prisma.category.deleteMany({
        where: {
          roomId: room.id,
        },
      });
      await prisma.roomPointValue.deleteMany({
        where: {
          roomId: room.id,
        },
      });
      await prisma.roomMember.deleteMany({
        where: {
          roomId: room.id,
        },
      });
      await prisma.room.delete({
        where: {
          id: room.id,
        },
      });
      try {
        await pusher.trigger({
          channel: getChannelName(room.slug),
          event: "deleteRoom",
          data: {
            eventData: null,
          },
        });
      } catch (e) {
        console.error(e);
      }
      return true;
    }),
  getMyRooms: protectedProcedure.query(async ({ ctx }) => {
    const { prisma, session } = ctx;
    const rooms = await prisma.room.findMany({
      where: {
        ownerId: session.user.id,
      },
      select: {
        slug: true,
        name: true,
      },
      orderBy: {
        id: "desc",
      },
    });
    return rooms;
  }),
  joinRoom: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          slug: input.slug,
        },
        include: {
          users: true,
          tickets: true,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      if (room.users.some((u) => u.userId === session.user.id)) {
        return room;
      }
      const user = await prisma.user.findUnique({
        where: {
          id: session.user.id,
        },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      if (room.users.length === room.maxMembers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Room is full",
        });
      }
      await prisma.user.update({
        where: {
          id: session.user.id,
        },
        data: {
          allRooms: {
            create: {
              roomId: room.id,
              spectator: room.tickets.some(
                (t) => t.done || t.voting || t.rejected || t.selected,
              ),
            },
          },
        },
      });
      return room;
    }),
  getRoom: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { prisma, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          slug: input.slug,
          users: {
            some: {
              userId: session.user.id,
            },
          },
        },
        include: {
          users: {
            select: {
              user: true,
              spectator: true,
            },
          },
          categories: true,
          values: {
            orderBy: {
              value: "asc",
            },
          },
          tickets: {
            include: {
              votes: true,
              results: true,
            },
          },
        },
      });
      if (!room) {
        return room;
      }
      return room;
    }),
  setSpectating: protectedProcedure
    .input(
      z.object({
        roomId: z.number(),
        spectating: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { prisma, pusher, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          id: input.roomId,
          users: {
            some: {
              userId: session.user.id,
            },
          },
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      await prisma.roomMember.update({
        where: {
          roomId_userId: {
            roomId: input.roomId,
            userId: session.user.id,
          },
        },
        data: {
          spectator: input.spectating,
        },
      });
      await pusher.trigger({
        event: "userSpectate",
        channel: getChannelName(room.slug),
        data: {
          eventData: {
            spectating: input.spectating,
            userId: session.user.id,
          },
          ignoreUser: session.user.id,
        },
      });
      return input.spectating;
    }),
  addTickets: protectedProcedure
    .input(
      z.object({
        roomId: z.number(),
        tickets: z.array(
          z.object({
            ticketId: z.string(),
            title: z.string(),
            url: z.string(),
            type: z.enum(["BUG", "TASK", "STORY", "EPIC"]),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          id: input.roomId,
          ownerId: session.user.id,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      const tickets = await prisma.$transaction(
        input.tickets.map((ticket) => {
          return prisma.ticket.create({
            data: {
              ticketId: ticket.ticketId,
              title: ticket.title,
              url: ticket.url,
              type: ticket.type,
              room: {
                connect: {
                  id: room.id,
                },
              },
            },
          });
        }),
      );
      await pusher.trigger({
        channel: getChannelName(room.slug),
        event: "newTickets",
        data: { ignoreUser: session.user.id, eventData: tickets },
      });
      return tickets;
    }),
  removeTickets: protectedProcedure
    .input(
      z.object({
        roomId: z.number(),
        tickets: z.array(z.number()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          id: input.roomId,
          ownerId: session.user.id,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      await prisma.ticket.deleteMany({
        where: {
          id: {
            in: input.tickets,
          },
        },
      });
      await pusher.trigger({
        channel: getChannelName(room.slug),
        event: "deleteTickets",
        data: {
          eventData: input.tickets,
          ignoreUser: session.user.id,
        },
      });
      return room;
    }),
  selectTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          done: false,
          selected: false,
          room: {
            ownerId: session.user.id,
          },
        },
        include: {
          room: true,
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      await prisma.ticket.updateMany({
        where: {
          roomId: ticket.roomId,
        },
        data: {
          selected: false,
          voting: false,
        },
      });
      await prisma.ticket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          selected: true,
          voting: true,
        },
      });
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "selectTicket",
        data: {
          ignoreUser: session.user.id,
          eventData: {
            id: ticket.id,
          },
        },
      });
      return ticket;
    }),
  vote: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
        votes: z.array(
          z.object({
            value: z.number(),
            category: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          selected: true,
          voting: true,
          room: {
            users: {
              some: {
                userId: session.user.id,
              },
            },
          },
        },
        include: {
          room: {
            include: {
              categories: true,
              users: true,
            },
          },
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      const vote = await prisma.$transaction(
        input.votes.map((vote) => {
          return prisma.vote.upsert({
            where: {
              userId_ticketId_categoryId: {
                userId: session.user.id,
                ticketId: input.ticketId,
                categoryId: vote.category,
              },
            },
            create: {
              value: vote.value,
              userId: session.user.id,
              ticketId: input.ticketId,
              categoryId: vote.category,
            },
            update: {
              value: vote.value,
            },
          });
        }),
      );
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "updateVotes",
        data: {
          ignoreUser: session.user.id,
          eventData: {
            user: session.user.id,
            votes: vote,
          },
        },
      });
      const voteCount = await prisma.vote.count({
        where: {
          ticketId: input.ticketId,
        },
      });
      const maxVoteCount =
        ticket.room.users.filter((u) => !u.spectator).length *
        ticket.room.categories.length;
      if (voteCount === maxVoteCount && ticket.autoComplete) {
        await prisma.ticket.update({
          where: {
            id: input.ticketId,
          },
          data: {
            voting: false,
            autoComplete: false,
          },
        });
        await pusher.trigger({
          channel: getChannelName(ticket.room.slug),
          event: "setCanVote",
          data: {
            eventData: {
              canVote: false,
            },
          },
        });
      }
      return vote;
    }),
  clearVotes: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
        clear: z.union([
          z.literal("all"),
          z.object({
            category: z.number(),
          }),
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          selected: true,
          room: {
            ownerId: session.user.id,
          },
        },
        include: {
          room: true,
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      await prisma.vote.deleteMany({
        where: {
          ticketId: input.ticketId,
          categoryId: input.clear === "all" ? undefined : input.clear.category,
        },
      });
      await prisma.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          autoComplete: true,
        },
      });
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "clearVotes",
        data: {
          eventData: input.clear,
          ignoreUser: session.user.id,
        },
      });
      return true;
    }),
  setCanVote: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
        canVote: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          selected: true,
          room: {
            ownerId: session.user.id,
          },
        },
        include: {
          room: true,
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      await prisma.ticket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          voting: input.canVote,
        },
      });
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "setCanVote",
        data: {
          eventData: { canVote: input.canVote },
          ignoreUser: session.user.id,
        },
      });
      return true;
    }),
  rejectTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          selected: true,
          room: {
            ownerId: session.user.id,
          },
        },
        include: {
          room: true,
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      const newTicket = await prisma.ticket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          done: true,
          selected: false,
          rejected: true,
        },
      });
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "rejectTicket",
        data: {
          ignoreUser: session.user.id,
          eventData: {
            id: ticket.id,
          },
        },
      });
      return newTicket;
    }),
  completeTicket: protectedProcedure
    .input(
      z.object({
        ticketId: z.number(),
        overrideValue: z.number().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const ticket = await prisma.ticket.findUnique({
        where: {
          id: input.ticketId,
          selected: true,
          room: {
            ownerId: session.user.id,
          },
        },
        include: {
          room: true,
        },
      });
      if (!ticket) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ticket not found",
        });
      }
      const votes = await prisma.vote.findMany({
        where: {
          ticketId: input.ticketId,
        },
        include: {
          category: true,
        },
      });
      const catSum = new Map<number, Decimal>();
      const catCount = new Map<number, number>();
      votes.forEach((vote) => {
        const current = catSum.get(vote.category.id) ?? new Decimal(0);
        catSum.set(vote.category.id, current.add(vote.value));
        const currentCount = catCount.get(vote.category.id) ?? 0;
        catCount.set(vote.category.id, currentCount + 1);
      });
      const results = new Map<number, Decimal>();
      catSum.forEach((sum, catId) => {
        const count = catCount.get(catId) ?? 0;
        results.set(catId, sum.div(count));
      });
      const resultObj: Record<number, Decimal> = {};
      const txItems: {
        value: Decimal;
        categoryId: number;
        ticketId: number;
      }[] = [];
      results.forEach((value, key) => {
        resultObj[key] = value;
        txItems.push({
          value,
          categoryId: key,
          ticketId: input.ticketId,
        });
      });
      const newTicket = await prisma.ticket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          done: true,
          selected: false,
          overrideValue: input.overrideValue ?? undefined,
        },
      });
      const resultTx = await prisma.$transaction(
        txItems.map((item) => {
          return prisma.result.create({
            data: item,
          });
        }),
      );
      await pusher.trigger({
        channel: getChannelName(ticket.room.slug),
        event: "completeTicket",
        data: {
          ignoreUser: session.user.id,
          eventData: {
            id: ticket.id,
            overrideValue: newTicket.overrideValue,
            results: resultTx,
          },
        },
      });
      return {
        newTicket,
        results: resultTx,
      };
    }),
  updateTimer: protectedProcedure
    .input(
      z.object({
        roomId: z.number(),
        start: z.date(),
        stop: z.date().nullish(),
        running: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, pusher, session } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          id: input.roomId,
          ownerId: session.user.id,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      const updatedRoom = await prisma.room.update({
        where: {
          id: input.roomId,
        },
        data: {
          timerStart: input.start,
          timerEnd: input.stop,
          timer: input.running,
        },
      });
      await pusher.trigger({
        channel: getChannelName(room.slug),
        event: "updateTimer",
        data: {
          ignoreUser: session.user.id,
          eventData: input,
        },
      });
      return updatedRoom;
    }),
  setUserData: protectedProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(2)
          .max(128)
          .regex(/^[a-zA-Z0-9_\- ]+$/),
        image: z.string().min(2).max(128).url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { prisma, session } = ctx;
      const user = await prisma.user.update({
        where: {
          id: session.user.id,
        },
        data: {
          name: input.name,

          image: input.image,
        },
      });
      return user;
    }),
});
