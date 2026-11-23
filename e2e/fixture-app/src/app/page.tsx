import { auth } from "@/auth";

// The page reads the session, so it can never be statically generated. Declared
// explicitly because an attempted static render during `next build` is a
// well-known Next.js failure mode.
export const dynamic = "force-dynamic";

/**
 * The protected page. Renders the session's claims so a test can tell it is
 * logged in and that the claims came from the IdP.
 */
export default async function Home() {
  const session = await auth();

  return (
    <main>
      <h1>E2E fixture</h1>
      <p data-testid="user-name">{session?.user?.name ?? ""}</p>
      <p data-testid="user-email">{session?.user?.email ?? ""}</p>
      <p data-testid="user-roles">{(session?.roles ?? []).join(",")}</p>
    </main>
  );
}
