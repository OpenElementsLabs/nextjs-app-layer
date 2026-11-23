// Public server-only surface of @open-elements/nextjs-app-layer.

export { createAppLayerAuth } from "./server/auth";
export type { AppLayerAuthConfig } from "./server/auth";

export { createBackendProxyHandler, createLogoutHandler } from "./server/route-handlers";
export type { BackendProxyConfig, LogoutHandlerConfig } from "./server/route-handlers";

export { createAppLayerProxy } from "./server/proxy";
export type { AppLayerProxyOptions, AppLayerPublicRoutes } from "./server/proxy";
