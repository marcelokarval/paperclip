import { beforeEach, describe, expect, it, vi } from "vitest";

const publishLiveEventMock = vi.hoisted(() => vi.fn());
const getGeneralMock = vi.hoisted(() => vi.fn().mockResolvedValue({ censorUsernameInLogs: false }));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: publishLiveEventMock,
}));

vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => ({
    getGeneral: getGeneralMock,
  }),
}));

import { logActivity, setPluginEventBus } from "../services/activity-log.js";

describe("activity log plugin bridge", () => {
  beforeEach(() => {
    publishLiveEventMock.mockReset();
    getGeneralMock.mockClear();
  });

  function createDbStub() {
    return {
      insert: () => ({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    } as any;
  }

  it("does not forward plugin-controlled system activity entries as core plugin events", async () => {
    const emit = vi.fn().mockResolvedValue({ errors: [] });
    setPluginEventBus({ emit } as any);

    await logActivity(createDbStub(), {
      companyId: "company-1",
      actorType: "system",
      actorId: "attacker-plugin",
      action: "issue.created",
      entityType: "plugin",
      entityId: "attacker-plugin",
      details: { source: "plugin.activity.log" },
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it("forwards trusted core events for non-system actors", async () => {
    const emit = vi.fn().mockResolvedValue({ errors: [] });
    setPluginEventBus({ emit } as any);

    await logActivity(createDbStub(), {
      companyId: "company-1",
      actorType: "user",
      actorId: "user-1",
      action: "issue.created",
      entityType: "issue",
      entityId: "issue-1",
      details: { title: "new issue" },
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      eventType: "issue.created",
      actorType: "user",
      actorId: "user-1",
      companyId: "company-1",
    });
  });
});
