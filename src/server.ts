// Public server-only surface of @open-elements/nextjs-app-layer.

export { createAppLayerAuth } from "./server/auth.js";
export type { AppLayerAuthConfig } from "./server/auth.js";

export { createBackendProxyHandler, createLogoutHandler } from "./server/route-handlers.js";
export type { BackendProxyConfig, LogoutHandlerConfig } from "./server/route-handlers.js";

export { createAppLayerProxy } from "./server/proxy.js";
export type { AppLayerProxyOptions, AppLayerPublicRoutes } from "./server/proxy.js";
