import Pusher from "pusher";
import { env } from "~/env.mjs";
import { type ZodType, z } from "zod";
import { Decimal } from "decimal.js";
import superjson from "superjson";

superjson.registerClass(Decimal, { identifier: "DecimalJS" });

export const _pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: env.PUSHER_CLUSTER,
  useTLS: true,
});

const standardData = z.object({
  ignoreUser: z.string().optional(),
});

const ticketType = z.enum(["BUG", "TASK", "STORY", "EPIC"]);

const decimalType = z.custom<Decimal>((input) => {
  if (input instanceof Decimal) {
    return true;
  }
  return false;
});

function sn<T extends ZodType>(type: T) {
  return z.object({
    ...standardData.shape,
    eventData: type,
  });
}
export const pusherConfig = {
  updateVotes: sn(
    z.object({
      user: z.string(),
      votes: z.array(
        z.object({
          categoryId: z.number(),
          value: decimalType,
          id: z.bigint(),
          ticketId: z.number(),
          userId: z.string(),
          updatedAt: z.date(),
        }),
      ),
    }),
  ),
  setCanVote: sn(
    z.object({
      canVote: z.boolean(),
    }),
  ),
  deleteRoom: sn(z.null()),
  clearVotes: sn(
    z.union([
      z.literal("all"),
      z.object({
        category: z.number(),
      }),
    ]),
  ),
  newTickets: sn(
    z.array(
      z.object({
        id: z.number(),
        ticketId: z.string(),
        title: z.string(),
        url: z.string(),
        type: ticketType,
        selected: z.boolean(),
        voting: z.boolean(),
        done: z.boolean(),
        rejected: z.boolean(),
        autoComplete: z.boolean(),
        overrideValue: decimalType.nullable(),
        roomId: z.number(),
      }),
    ),
  ),
  userSpectate: sn(
    z.object({
      spectating: z.boolean(),
      userId: z.string(),
    }),
  ),
  userLeave: sn(
    z.object({
      user: z.string(),
    }),
  ),
  deleteTickets: sn(z.array(z.number())),
  selectTicket: sn(
    z.object({
      id: z.number(),
    }),
  ),
  rejectTicket: sn(
    z.object({
      id: z.number(),
    }),
  ),
  completeTicket: sn(
    z.object({
      id: z.number(),
      overrideValue: decimalType.nullable(),
      results: z.array(
        z.object({
          id: z.bigint(),
          ticketId: z.number(),
          categoryId: z.number(),
          value: decimalType,
        }),
      ),
    }),
  ),
  updateTimer: sn(
    z.object({
      start: z.date(),
      stop: z.date().nullish(),
      running: z.boolean(),
    }),
  ),
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
    return this.innerPusher.trigger(
      input.channel,
      input.event,
      superjson.stringify(input.data),
    );
  }
}

export const pusher = new TypedPusher(_pusher);
