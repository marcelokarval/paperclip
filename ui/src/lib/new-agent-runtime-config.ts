import { defaultCreateValues } from "../components/agent-config-defaults";

export function buildNewAgentRuntimeConfig(input?: {
  heartbeatEnabled?: boolean;
  intervalSec?: number;
  cheapModel?: string;
  cheapModelEnabled?: boolean;
}) {
  const config: Record<string, unknown> = {
    heartbeat: {
      enabled: input?.heartbeatEnabled ?? defaultCreateValues.heartbeatEnabled,
      intervalSec: input?.intervalSec ?? defaultCreateValues.intervalSec,
      wakeOnDemand: true,
      cooldownSec: 10,
      maxConcurrentRuns: 1,
    },
  };
  const cheapModel = input?.cheapModel?.trim() ?? "";
  if (cheapModel && input?.cheapModelEnabled) {
    config.modelProfiles = {
      cheap: {
        enabled: true,
        adapterConfig: { model: cheapModel },
      },
    };
  }
  return config;
}
