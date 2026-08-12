"use client";

import { useEffect } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";

function RefreshTokenErrorWatcher() {
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      window.location.href = "/api/logout";
    }
  }, [session?.error]);
  return null;
}

export interface SessionProviderProps {
  readonly children: React.ReactNode;
  /** Session poll interval in seconds. Lower it for short-lived access tokens. */
  readonly refetchInterval?: number;
}

export function SessionProvider({ children, refetchInterval = 120 }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider refetchInterval={refetchInterval} refetchOnWindowFocus>
      <RefreshTokenErrorWatcher />
      {children}
    </NextAuthSessionProvider>
  );
}
