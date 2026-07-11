"use client";

import { useEffect, useState } from "react";
import { CapabilityStatus, HealthStatus } from "@open-elements/ui";
import { useAppLayerTranslations } from "../../../translations/provider";

/** One runtime-capability row configured by the consuming app. */
export interface StatusCapabilityItem {
  /** Matches a boolean key returned by the capabilities endpoint. */
  readonly id: string;
  readonly label: string;
  readonly availableText: string;
  readonly unavailableText: string;
  readonly hint?: string;
}

/** Optional "runtime capabilities" panel for the server status page. */
export interface StatusCapabilitiesConfig {
  /** App endpoint returning a `{ [id]: boolean }` map (fetched via the Next proxy). */
  readonly endpoint: string;
  readonly items: ReadonlyArray<StatusCapabilityItem>;
}

export function ServerStatusClient({
  capabilities,
}: {
  readonly capabilities?: StatusCapabilitiesConfig;
}) {
  const t = useAppLayerTranslations();
  const [healthy, setHealthy] = useState<boolean | null>(null);
  // `null` until the capabilities fetch settles; then a `{ id -> available }` map.
  const [capabilityState, setCapabilityState] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHealthy(data?.status === "UP"))
      .catch(() => setHealthy(false));
  }, []);

  useEffect(() => {
    if (!capabilities) {
      return;
    }
    let cancelled = false;
    // Fail-safe: any failure resolves to an empty map, so every configured row
    // renders as unavailable — an operator must never see a false "available".
    fetch(capabilities.endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Record<string, boolean> | null) => {
        if (!cancelled) {
          setCapabilityState(data ?? {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCapabilityState({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capabilities]);

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-oe-dark">{t.nav.serverStatus}</h1>
      <div className="space-y-4">
        {healthy !== null && (
          <HealthStatus
            healthy={healthy}
            translations={{
              title: t.health.title,
              statusUp: t.health.statusUp,
              statusDown: t.health.statusDown,
            }}
          />
        )}
        {capabilities &&
          capabilityState !== null &&
          capabilities.items.map((item) => (
            <CapabilityStatus
              key={item.id}
              available={capabilityState[item.id] === true}
              label={item.label}
              availableText={item.availableText}
              unavailableText={item.unavailableText}
              hint={item.hint}
            />
          ))}
      </div>
    </div>
  );
}
