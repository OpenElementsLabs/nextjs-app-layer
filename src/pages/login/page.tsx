import { LoginClient } from "./login-client";

export function createLoginPage({
  appName,
  homeRoute,
}: {
  readonly appName: string;
  readonly homeRoute?: string;
}) {
  return function LoginPage() {
    return <LoginClient appName={appName} homeRoute={homeRoute} />;
  };
}
