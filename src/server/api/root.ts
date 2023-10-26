import { mainRouter } from "~/server/api/routers/main";
import { createTRPCRouter } from "~/server/api/trpc";
import { jiraRouter } from "./routers/jira";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  main: mainRouter,
  jira: jiraRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
