import { describe, expect, it, vi } from "vitest";
import { createPluginEventBus } from "../services/plugin-event-bus.js";

describe("createPluginEventBus", () => {
  it("skips delivery to plugins disabled for the event company", async () => {
    const onA = vi.fn(async () => {});
    const onB = vi.fn(async () => {});

    const bus = createPluginEventBus({
      isPluginAvailableForCompany: async (pluginId, companyId) =>
        !(pluginId === "plugin-a" && companyId === "company-b"),
    });
    bus.forPlugin("plugin-a").subscribe("issue.created", onA);
    bus.forPlugin("plugin-b").subscribe("issue.created", onB);

    await bus.emit({
      eventId: "evt-1",
      eventType: "issue.created",
      companyId: "company-b",
      occurredAt: new Date().toISOString(),
      actorType: "system",
      actorId: "system",
      entityId: "iss-1",
      entityType: "issue",
      payload: { companyId: "company-b" },
    });

    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
  });
});
