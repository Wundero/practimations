import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import { createTRPCContext } from "./trpc";
import superjson from "superjson";
import { appRouter } from "./root";
export const serverSideHelpers = async (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return createServerSideHelpers({
    ctx: await createTRPCContext(ctx),
    router: appRouter,
    transformer: superjson,
  });
};
