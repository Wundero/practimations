/* eslint-disable @typescript-eslint/ban-types */
import Pusher, { type Channel } from "pusher-js";
import { useEffect, createContext, useContext, useState } from "react";
import { env } from "~/env.mjs";
import { rawAPI } from "~/utils/api";
import type { Event, Data } from "~/server/integrations/pusher";

const pusher = new Pusher(env.NEXT_PUBLIC_PUSHER_KEY, {
  cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER,
  userAuthentication: {
    // These two are mandatory in TS but not used
    endpoint: "/api/pusher/auth",
    transport: "ajax",
    customHandler(info, callback) {
      rawAPI.main.authenticateUser
        .mutate({
          socketId: info.socketId,
        })
        .then((data) => {
          callback(null, data);
        })
        .catch((err: Error) => {
          callback(err, null);
        });
    },
  },
  channelAuthorization: {
    // These two are mandatory in TS but not used
    endpoint: "/api/pusher/auth",
    transport: "ajax",
    customHandler(info, callback) {
      rawAPI.main.authorizeUserForRoom
        .mutate({
          socketId: info.socketId,
          channelName: info.channelName,
        })
        .then((data) => {
          callback(null, data);
        })
        .catch((err: Error) => {
          callback(err, null);
        });
    },
  },
});

class ChannelRef {
  channel: Channel;
  rc: number;

  constructor(channel: Channel) {
    this.channel = channel;
    this.rc = 0;
  }

  getChannel() {
    return this.channel;
  }

  getRC() {
    return this.rc;
  }

  incrementRC() {
    this.rc++;
  }

  decrementRC() {
    this.rc--;
  }
}

export type PusherContextState = {
  pusher: Pusher;
  channels: Map<string, ChannelRef>;
};

const channels = new Map<string, ChannelRef>();

export const PusherContext = createContext<PusherContextState>({
  pusher,
  channels,
});

export function PusherProvider({ children }: { children: React.ReactNode }) {
  return (
    <PusherContext.Provider value={{ pusher, channels }}>
      {children}
    </PusherContext.Provider>
  );
}

export function usePusherChannel(channelName: string) {
  const { pusher, channels } = useContext(PusherContext);
  const [channel, setChannel] = useState<Channel | null>(null);
  useEffect(() => {
    const channelRef =
      channels.get(channelName) ??
      new ChannelRef(pusher.subscribe(channelName));
    channelRef.incrementRC();
    channels.set(channelName, channelRef);
    setChannel(channelRef.channel);
    return () => {
      const channelRC = channelRef.getRC();
      if (channelRC <= 1) {
        channels.delete(channelName);
        pusher.unsubscribe(channelName);
      } else {
        channelRef.decrementRC();
      }
      setChannel(null);
    };
  }, [channelName, pusher, channels]);
  return channel;
}

export function usePusherEvent<E extends Event, T extends Data<E>>(
  channelName: string,
  eventName: E,
  onEvent: (data: T) => void,
) {
  const { pusher, channels } = useContext(PusherContext);
  useEffect(() => {
    const channelRef =
      channels.get(channelName) ??
      new ChannelRef(pusher.subscribe(channelName));
    channelRef.incrementRC();
    channels.set(channelName, channelRef);
    const channel = channelRef.channel;
    channel.bind(eventName, onEvent);
    return () => {
      channel.unbind(eventName, onEvent);
      const channelRC = channelRef.getRC();
      if (channelRC <= 1) {
        channels.delete(channelName);
        pusher.unsubscribe(channelName);
      } else {
        channelRef.decrementRC();
      }
    };
  }, [channelName, eventName, onEvent, pusher, channels]);
}
