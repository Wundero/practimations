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
  createRoom: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        categories: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { prisma, session } = ctx;
      const room = await prisma.room.create({
        data: {
          name: input.name,
          categories: {
            createMany: {
              data: input.categories.map((category) => ({
                name: category,
              })),
            },
          },
          users: {
            connect: {
              id: session.user.id,
            },
          },
          owner: {
            connect: {
              id: session.user.id,
            },
          },
        },
        include: {
          categories: true,
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
      await prisma.room.update({
        where: {
          id: room.id,
        },
        data: {
          users: {
            set: [],
          },
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
      const { prisma, session, pusher } = ctx;
      const room = await prisma.room.findUnique({
        where: {
          slug: input.slug,
        },
        include: {
          users: true,
          categories: true,
        },
      });
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Room not found",
        });
      }
      if (room.users.some((u) => u.id === session.user.id)) {
        return room;
      }
      const user = await prisma.user.findUnique({
        where: {
          id: session.user.id,
        },
        include: {
          currentRoom: true,
        },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      const oldRoom = user.currentRoom;
      if (oldRoom) {
        await pusher.trigger({
          channel: getChannelName(oldRoom.slug),
          event: "userLeave",
          data: {
            ignoreUser: session.user.id,
            eventData: {
              user: session.user.id,
            },
          },
        });
      }
      await prisma.user.update({
        where: {
          id: session.user.id,
        },
        data: {
          currentRoom: {
            connect: {
              id: room.id,
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
              id: session.user.id,
            },
          },
        },
        include: {
          users: true,
          categories: true,
          tickets: {
            include: {
              votes: true,
              results: true,
            },
          },
        },
      });
      return room;
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
                id: session.user.id,
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
      const maxVoteCount = ticket.room.users.length * ticket.room.categories.length;
      if (voteCount === maxVoteCount) {
        await prisma.ticket.update({
          where: {
            id: input.ticketId,
          },
          data: {
            voting: false,
          },
        });
        await pusher.trigger({
          channel: getChannelName(ticket.room.slug),
          event: 'setCanVote',
          data: {
            eventData: {
              canVote: false,
            },
          }
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
  completeTicket: protectedProcedure
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
      const votes = await prisma.vote.findMany({
        where: {
          ticketId: input.ticketId,
        },
        include: {
          category: true,
        },
      });
      const catSum = new Map<number, number>();
      const catCount = new Map<number, number>();
      votes.forEach((vote) => {
        const current = catSum.get(vote.category.id) ?? 0;
        catSum.set(vote.category.id, current + vote.value);
        const currentCount = catCount.get(vote.category.id) ?? 0;
        catCount.set(vote.category.id, currentCount + 1);
      });
      const results = new Map<number, number>();
      catSum.forEach((sum, catId) => {
        const count = catCount.get(catId) ?? 0;
        results.set(catId, sum / count);
      });
      const resultObj: Record<number, number> = {};
      const txItems: {
        value: number;
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
      await prisma.ticket.update({
        where: {
          id: input.ticketId,
        },
        data: {
          done: true,
          selected: false,
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
            results: resultTx,
          },
        },
      });
      return { ticket, results: resultTx };
    }),
});
