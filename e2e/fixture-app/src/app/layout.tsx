import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LanguageProvider } from "@open-elements/ui";
import { AppLayerTranslationProvider, SessionProvider } from "@open-elements/nextjs-app-layer";

export const metadata: Metadata = { title: "E2E", robots: { index: false, follow: false } };

/**
 * Deliberately *not* `OERootLayout`.
 *
 * `OERootLayout` imports `next/font/google`, which downloads Montserrat and Lato
 * at build time — making every CI run depend on `fonts.googleapis.com` being
 * reachable, for something that tests nothing about authentication. This layout
 * replicates the provider stack the library's client components actually need:
 * `SessionProvider` for `useSession`, `LanguageProvider` for `useLanguage`, and
 * `AppLayerTranslationProvider` on top of it. `ApiClientProvider` is omitted
 * because nothing in this fixture calls `useApiClient`.
 *
 * The fidelity gap is recorded in the README.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <LanguageProvider translations={{ en: {}, de: {} }}>
            <AppLayerTranslationProvider>{children}</AppLayerTranslationProvider>
          </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
