// Public client-safe surface of @open-elements/nextjs-app-layer.
// Server-only factories live in ./server.ts and are imported via
// `@open-elements/nextjs-app-layer/server`.

export { ROLE_APP_ADMIN, ROLE_APP_USER, ROLE_IT_ADMIN, hasRole } from "./lib/roles.js";
export { ForbiddenError } from "./lib/forbidden-error.js";

export {
  AppLayerTranslationProvider,
  useAppLayerTranslations,
  appLayerTranslations,
} from "./translations/provider.js";
export type { AppLayerTranslations } from "./translations/provider.js";

export { SessionProvider } from "./components/session-provider.js";
export type { SessionProviderProps } from "./components/session-provider.js";
export { ForbiddenPage } from "./components/forbidden-page.js";
export { BearerTokenCard } from "./components/bearer-token-card.js";
export { AddCommentDialog } from "./components/add-comment-dialog.js";

export { ApiClientProvider, useApiClient } from "./hooks/api-client.js";
export { defaultApiClient } from "./api/client.js";
export type { AppLayerApiClient } from "./api/client.js";

export { createAuditLogsPage } from "./pages/admin/audit-logs/page.js";
export { AuditLogsClient } from "./pages/admin/audit-logs/audit-logs-client.js";
export { auditLogsPageMeta } from "./pages/admin/audit-logs/meta.js";

export { createUsersPage } from "./pages/admin/users/page.js";
export { UsersClient } from "./pages/admin/users/users-client.js";
export { usersPageMeta } from "./pages/admin/users/meta.js";

export { createServerStatusPage } from "./pages/admin/status/page.js";
export { ServerStatusClient } from "./pages/admin/status/server-status-client.js";
export type {
  StatusCapabilitiesConfig,
  StatusCapabilityItem,
} from "./pages/admin/status/server-status-client.js";
export { serverStatusPageMeta } from "./pages/admin/status/meta.js";

export { createBearerTokenPage } from "./pages/admin/token/page.js";
export { BearerTokenClient } from "./pages/admin/token/bearer-token-client.js";
export { bearerTokenPageMeta } from "./pages/admin/token/meta.js";

export { createApiKeysPage } from "./pages/api-keys/page.js";
export { ApiKeysClient } from "./pages/api-keys/api-keys-client.js";
export { apiKeysPageMeta } from "./pages/api-keys/meta.js";

export { createWebhooksPage } from "./pages/webhooks/page.js";
export { WebhooksClient } from "./pages/webhooks/webhooks-client.js";
export { webhooksPageMeta } from "./pages/webhooks/meta.js";

export { createLoginPage } from "./pages/login/page.js";
export { LoginClient } from "./pages/login/login-client.js";

// OERootLayout is exposed at "@open-elements/nextjs-app-layer/layout" so the
// `next/font/google` runtime call (compile-time in Next.js, but a real call
// under jest/vitest) does not get pulled into every consumer of the barrel.

export type {
  Page,
  UserDto,
  AuditAction,
  AuditLogDto,
  ApiKeyDto,
  ApiKeyCreateDto,
  ApiKeyCreatedDto,
  WebhookDto,
  WebhookCreateDto,
  WebhookUpdateDto,
  TranslationConfigDto,
  PageRequest,
} from "./api/types.js";
