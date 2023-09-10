import Pusher from "pusher";
import { env } from "~/env.mjs";
import { type ZodType, z } from "zod";

export const _pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: env.PUSHER_CLUSTER,
  useTLS: true,
});

// Type: Record<channel, Record<event, ZodType>>
export const pusherConfig = {
  updateVotes: z.object({
    user: z.string(),
    votes: z.array(z.object({ category: z.number(), vote: z.number() })),
  }),
  setCanVote: z.object({
    canVote: z.boolean(),
  }),
  deleteRoom: z.null(),
  clearVotes: z.union([
    z.literal("all"),
    z.object({
      category: z.number(),
    }),
  ]),
  newTickets: z.array(
    z.object({
      id: z.number(),
      ticketId: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
  deleteTickets: z.array(z.number()),
  selectTicket: z.object({
    id: z.number(),
  }),
  completeTicket: z.object({
    id: z.number(),
    results: z.record(z.number()),
  }),
} as const;

export type Event = keyof typeof pusherConfig;
export type Data<E extends Event> = z.infer<(typeof pusherConfig)[E]>;

type PusherInput = {
  [T in Event]: {
    channel: string;
    event: T;
    data: Data<T>;
  };
}[Event];

export const zodConfig = z.custom<PusherInput>((input) => {
  if (!input) {
    return false;
  }
  if (typeof input !== "object") {
    return false;
  }
  if ("channel" in input && "event" in input) {
    const validatedInput = input as {
      channel: string;
      event: string;
      data: unknown;
    };
    if (validatedInput.event in pusherConfig) {
      const eventValidator = pusherConfig[
        validatedInput.event as keyof typeof pusherConfig
      ] as ZodType;
      if (
        eventValidator &&
        eventValidator.safeParse(validatedInput.data).success
      ) {
        return true;
      }
    }
  }
  return false;
});

class TypedPusher {
  private innerPusher: Pusher;

  constructor(pusher: Pusher) {
    this.innerPusher = pusher;
  }

  terminateUserConnections(userId: string) {
    return this.innerPusher.terminateUserConnections(userId);
  }

  webhook(request: Pusher.WebHookRequest) {
    return this.innerPusher.webhook(request);
  }

  sendToUser(userId: string, event: string, data: unknown) {
    return this.innerPusher.sendToUser(userId, event, data);
  }

  createSignedQueryString(options: Pusher.SignedQueryStringOptions) {
    return this.innerPusher.createSignedQueryString(options);
  }

  authenticateUser(socketId: string, userData: Pusher.UserChannelData) {
    return this.innerPusher.authenticateUser(socketId, userData);
  }

  authorizeChannel(
    socketId: string,
    channel: string,
    data?: Pusher.PresenceChannelData,
  ) {
    return this.innerPusher.authorizeChannel(socketId, channel, data);
  }

  trigger(input: PusherInput) {
    return this.innerPusher.trigger(input.channel, input.event, input.data);
  }
}

export const pusher = new TypedPusher(_pusher);
