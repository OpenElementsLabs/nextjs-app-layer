import { createAppLayerProxy } from "@open-elements/nextjs-app-layer/server";
import { auth } from "@/auth";

export default createAppLayerProxy(auth);

// `config` MUST be a static literal here; it cannot be imported. Next.js reads
// the matcher from this file's own AST and silently falls back to matching every
// request when it finds no literal declaration. This copy is pinned against the
// tested one by `src/server/__tests__/proxy-matcher.test.ts`.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
