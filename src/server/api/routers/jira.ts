import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  applyPointsToTickets,
  getAllFields,
  getAccessibleSites,
} from "~/server/integrations/tickets/jira";

export const jiraRouter = createTRPCRouter({
  getJIRASites: protectedProcedure.query(async ({ ctx }) => {
    return getAccessibleSites(ctx.session);
  }),
  getJIRAFields: protectedProcedure
    .input(
      z.object({
        cloudId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.cloudId) {
        return [];
      }
      return getAllFields(ctx.session, input.cloudId);
    }),
  exportTickets: protectedProcedure
    .input(
      z.object({
        tickets: z.array(
          z.object({
            ticketId: z.string(),
            value: z.number(),
          }),
        ),
        fieldId: z.string(),
        cloudId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tickets = await ctx.prisma.ticket.findMany({
        where: {
          ticketId: {
            in: input.tickets.map((ticket) => ticket.ticketId),
          },
        },
      });
      const ticketMap = input.tickets.map((ticket) => ({
        ticket: tickets.find((t) => t.ticketId === ticket.ticketId)!,
        value: ticket.value,
      }));
      return applyPointsToTickets(
        ticketMap,
        ctx.session,
        input.fieldId,
        input.cloudId,
      );
    }),
});
