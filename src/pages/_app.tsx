import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { type AppType } from "next/app";
import { PusherProvider } from "~/hooks/usePusher";

import { api } from "~/utils/api";

import "~/styles/globals.css";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <ThemeProvider>
      <SessionProvider session={session}>
        <PusherProvider>
          <Component {...pageProps} />
        </PusherProvider>
      </SessionProvider>
    </ThemeProvider>
  );
};

export default api.withTRPC(MyApp);
