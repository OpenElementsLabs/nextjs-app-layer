"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Button } from "@open-elements/ui";
import { useAppLayerTranslations } from "../../translations/provider.js";
import type { AppLayerTranslations } from "../../translations/provider.js";

export function LoginClient({
  appName,
  homeRoute = "/",
}: {
  readonly appName: string;
  readonly homeRoute?: string;
}) {
  return (
    <Suspense>
      <LoginContent appName={appName} homeRoute={homeRoute} />
    </Suspense>
  );
}

/**
 * Pick the message for an Auth.js error type.
 *
 * `AccessDenied` is the one case where retrying cannot help, so it keeps its own
 * message; everything else is treated as retryable.
 *
 * This is deliberately a classification and not an enumeration. `@auth/core`
 * passes only a fixed `clientErrors` set through by type and collapses
 * everything else to `Configuration`, so which type a given failure produces is
 * an implementation detail. Measured against 0.41.0: an interrupted PKCE login
 * surfaces as `CallbackRouteError` → `Configuration`, not as the `InvalidCheck`
 * the server log would suggest. Enumerating would have missed it, and would miss
 * any type a future version adds.
 */
export function errorMessageFor(
  error: string,
  translations: AppLayerTranslations["login"],
): string {
  return error === "AccessDenied" ? translations.errorAccessDenied : translations.errorExpired;
}

function LoginContent({
  appName,
  homeRoute,
}: {
  readonly appName: string;
  readonly homeRoute: string;
}) {
  const t = useAppLayerTranslations();
  const S = t.login;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const error = searchParams.get("error");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (error) {
      console.error("Auth error:", error);
    }
  }, [error]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace(homeRoute);
    }
  }, [status, session, router, homeRoute]);

  if (status === "loading" || (status === "authenticated" && session)) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-oe-white md:bg-oe-gray-lightest">
      <div className="flex w-full flex-col items-center gap-8 bg-oe-dark px-8 py-16 text-white md:max-w-md md:rounded-2xl">
        <img src="/oe-logo-landscape-dark.svg" alt="Open Elements" className="h-12" />

        <h1 className="font-heading text-3xl font-bold">{appName}</h1>

        {error && <p className="text-center text-sm text-oe-red">{errorMessageFor(error, S)}</p>}

        <Button
          onClick={() => {
            setSigningIn(true);
            void signIn("oidc");
          }}
          disabled={signingIn}
          className="w-full max-w-xs py-6 text-lg"
          size="lg"
        >
          {S.button}
        </Button>

        <div className="mt-4 flex items-center gap-2 text-xs text-oe-gray-light">
          <span>{S.developedBy}</span>
          <a
            href="https://open-elements.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            Open Elements
          </a>
        </div>
      </div>
    </div>
  );
}
