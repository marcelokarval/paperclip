import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { notifyHireApproved } from "../services/hire-hook.js";

// Mock the registry so we control whether the adapter has onHireApproved and what it does.
vi.mock("../adapters/registry.js", () => ({
  findActiveServerAdapter: vi.fn(),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

const mockIssueService = {
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    id,
    identifier: id === "issue-2" ? "P4Y-2" : "P4Y-1",
    assigneeAgentId: (patch.assigneeAgentId as string | null | undefined) ?? null,
    status: (patch.status as string | undefined) ?? "todo",
  })),
  addComment: vi.fn().mockResolvedValue({ id: "comment-1" }),
};
const mockHeartbeatService = {
  wakeup: vi.fn().mockResolvedValue({ id: "run-1" }),
};

vi.mock("../services/issues.js", () => ({
  issueService: vi.fn(() => mockIssueService),
}));
vi.mock("../services/heartbeat.js", () => ({
  heartbeatService: vi.fn(() => mockHeartbeatService),
}));

const { findActiveServerAdapter } = await import("../adapters/registry.js");
const { logActivity } = await import("../services/activity-log.js");
const { issueService } = await import("../services/issues.js");

function mockDbWithAgent(agent: { id: string; companyId: string; name: string; adapterType: string; adapterConfig?: Record<string, unknown> }): Db {
  let selectCount = 0;
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
        where: () => {
          selectCount += 1;
          if (selectCount === 1) {
            return Promise.resolve([
              {
                id: agent.id,
                companyId: agent.companyId,
                name: agent.name,
                adapterType: agent.adapterType,
                adapterConfig: agent.adapterConfig ?? {},
              },
            ]);
          }
          return Promise.resolve([]);
        },
      }),
    }),
  } as unknown as Db;
}

function mockDbWithAgentAndHireContext(input: {
  agent: { id: string; companyId: string; name: string; adapterType: string; adapterConfig?: Record<string, unknown> };
  linkedIssue: {
    id: string;
    identifier: string | null;
    title: string | null;
    originKind?: string | null;
    parentId?: string | null;
    projectId: string | null;
    projectName: string | null;
    projectOperatingContext: Record<string, unknown> | null;
  } | null;
  parentIssue?: {
    id: string;
    identifier: string | null;
    title: string | null;
  } | null;
}): Db {
  let selectCount = 0;
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => {
              selectCount += 1;
              if (selectCount === 1) {
                return Promise.resolve([
                  {
                    id: input.agent.id,
                    companyId: input.agent.companyId,
                    name: input.agent.name,
                    adapterType: input.agent.adapterType,
                    adapterConfig: input.agent.adapterConfig ?? {},
                  },
                ]);
              }
              return Promise.resolve(input.linkedIssue ? [input.linkedIssue] : []);
            },
          }),
        }),
        where: () => {
          selectCount += 1;
          if (selectCount === 1) {
            return Promise.resolve([
              {
                id: input.agent.id,
                companyId: input.agent.companyId,
                name: input.agent.name,
                adapterType: input.agent.adapterType,
                adapterConfig: input.agent.adapterConfig ?? {},
              },
            ]);
          }
          if (selectCount === 2) {
            return Promise.resolve(input.linkedIssue ? [input.linkedIssue] : []);
          }
          return Promise.resolve(input.parentIssue ? [input.parentIssue] : []);
        },
      }),
    }),
  } as unknown as Db;
}

afterEach(() => {
  vi.clearAllMocks();
  mockIssueService.addComment.mockResolvedValue({ id: "comment-1" });
  mockIssueService.update.mockClear();
  mockHeartbeatService.wakeup.mockResolvedValue({ id: "run-1" });
});

describe("notifyHireApproved", () => {
  it("writes success activity when adapter hook returns ok", async () => {
    const onHireApproved = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(findActiveServerAdapter).mockReturnValue({
      type: "openclaw_gateway",
      onHireApproved,
    } as any);

    const db = mockDbWithAgent({
      id: "a1",
      companyId: "c1",
      name: "OpenClaw Agent",
      adapterType: "openclaw_gateway",
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "approval",
        sourceId: "ap1",
      }),
    ).resolves.toBeUndefined();

    expect(onHireApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("assign you a task"),
        hireContext: null,
      }),
      expect.any(Object),
    );
    expect(issueService).toHaveBeenCalled();
    expect(mockIssueService.update).not.toHaveBeenCalled();
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "hire_hook.succeeded",
        entityId: "a1",
        details: expect.objectContaining({ source: "approval", sourceId: "ap1", adapterType: "openclaw_gateway" }),
      }),
    );
  });

  it("does nothing when agent is not found", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as unknown as Db;

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "join_request",
        sourceId: "jr1",
      }),
    ).resolves.toBeUndefined();

    expect(findActiveServerAdapter).not.toHaveBeenCalled();
  });

  it("still records success when adapter has no onHireApproved hook", async () => {
    vi.mocked(findActiveServerAdapter).mockReturnValue({ type: "process" } as any);

    const db = mockDbWithAgent({
      id: "a1",
      companyId: "c1",
      name: "Agent",
      adapterType: "process",
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "approval",
        sourceId: "ap1",
      }),
    ).resolves.toBeUndefined();

    expect(findActiveServerAdapter).toHaveBeenCalledWith("process");
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "hire_hook.succeeded",
        details: expect.objectContaining({ adapterType: "process" }),
      }),
    );
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
  });

  it("logs failed result when adapter onHireApproved returns ok=false", async () => {
    vi.mocked(findActiveServerAdapter).mockReturnValue({
      type: "openclaw_gateway",
      onHireApproved: vi.fn().mockResolvedValue({ ok: false, error: "HTTP 500", detail: { status: 500 } }),
    } as any);

    const db = mockDbWithAgent({
      id: "a1",
      companyId: "c1",
      name: "OpenClaw Agent",
      adapterType: "openclaw_gateway",
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "join_request",
        sourceId: "jr1",
      }),
    ).resolves.toBeUndefined();

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "hire_hook.failed",
        entityId: "a1",
        details: expect.objectContaining({ source: "join_request", sourceId: "jr1", error: "HTTP 500" }),
      }),
    );
  });

  it("does not throw when adapter onHireApproved throws (non-fatal)", async () => {
    vi.mocked(findActiveServerAdapter).mockReturnValue({
      type: "openclaw_gateway",
      onHireApproved: vi.fn().mockRejectedValue(new Error("Network error")),
    } as any);

    const db = mockDbWithAgent({
      id: "a1",
      companyId: "c1",
      name: "OpenClaw Agent",
      adapterType: "openclaw_gateway",
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "join_request",
        sourceId: "jr1",
      }),
    ).resolves.toBeUndefined();

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "hire_hook.error",
        entityId: "a1",
        details: expect.objectContaining({ source: "join_request", sourceId: "jr1", error: "Network error" }),
      }),
    );
  });

  it("includes linked project baseline context in hire payloads for approval-sourced hires", async () => {
    const onHireApproved = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(findActiveServerAdapter).mockReturnValue({
      type: "openclaw_gateway",
      onHireApproved,
    } as any);

    const db = mockDbWithAgentAndHireContext({
      agent: {
        id: "a1",
        companyId: "c1",
        name: "CTO",
        adapterType: "openclaw_gateway",
      },
      linkedIssue: {
        id: "issue-1",
        identifier: "P4Y-1",
        title: "Repository baseline review",
        projectId: "project-1",
        projectName: "Prop4You Next.js Fullstack",
        projectOperatingContext: {
          baselineStatus: "accepted",
          baselineTrackingIssueIdentifier: "P4Y-1",
          overviewSummary: "Existing Next.js real-estate platform with accepted repository baseline.",
        },
      },
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "approval",
        sourceId: "approval-1",
      }),
    ).resolves.toBeUndefined();

    expect(onHireApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        hireContext: expect.objectContaining({
          sourceIssueIdentifier: "P4Y-1",
          projectName: "Prop4You Next.js Fullstack",
          baselineStatus: "accepted",
          baselineTrackingIssueIdentifier: "P4Y-1",
        }),
        message: expect.stringContaining("PROJECT_PACKET.md"),
      }),
      expect.any(Object),
    );
    expect(mockIssueService.addComment).toHaveBeenCalledWith(
      "issue-1",
      expect.stringContaining("## Hire Approved"),
      {},
    );
    expect(mockIssueService.update).not.toHaveBeenCalled();
    expect(mockIssueService.addComment.mock.calls.at(-1)?.[1]).toContain("P4Y-1");
    expect(mockIssueService.addComment.mock.calls.at(-1)?.[1]).toContain("PROJECT_PACKET.md");
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        source: "assignment",
        reason: "issue_assigned",
        payload: expect.objectContaining({
          issueId: "issue-1",
          mutation: "hire_approved",
        }),
        contextSnapshot: expect.objectContaining({
          issueId: "issue-1",
          taskId: "issue-1",
          source: "hire.approved",
          wakeReason: "issue_assigned",
          hireApproved: true,
          forceFreshSession: true,
        }),
      }),
    );
  });

  it("treats staffing issue as the handoff thread and baseline issue as the technical reference", async () => {
    const onHireApproved = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(findActiveServerAdapter).mockReturnValue({
      type: "openclaw_gateway",
      onHireApproved,
    } as any);

    const db = mockDbWithAgentAndHireContext({
      agent: {
        id: "a1",
        companyId: "c1",
        name: "CTO",
        adapterType: "openclaw_gateway",
      },
      linkedIssue: {
        id: "issue-2",
        identifier: "P4Y-2",
        title: "Hire CTO for prop4you-nextjs-fullstack",
        originKind: "staffing_hiring",
        status: "backlog",
        assigneeAgentId: null,
        parentId: "issue-1",
        projectId: "project-1",
        projectName: "Prop4You Next.js Fullstack",
        projectOperatingContext: {
          baselineStatus: "accepted",
          baselineTrackingIssueIdentifier: null,
          overviewSummary: "Existing Next.js real-estate platform with accepted repository baseline.",
        },
      },
      parentIssue: {
        id: "issue-1",
        identifier: "P4Y-1",
        title: "Repository baseline review",
      },
    });

    await expect(
      notifyHireApproved(db, {
        companyId: "c1",
        agentId: "a1",
        source: "approval",
        sourceId: "approval-2",
      }),
    ).resolves.toBeUndefined();

    expect(onHireApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        hireContext: expect.objectContaining({
          sourceIssueIdentifier: "P4Y-2",
          sourceIssueKind: "staffing_hiring",
          sourceIssueStatus: "backlog",
          sourceIssueAssigneeAgentId: null,
          baselineTrackingIssueIdentifier: "P4Y-1",
          baselineIssueTitle: "Repository baseline review",
        }),
        message: expect.stringContaining("staffing issue P4Y-2"),
      }),
      expect.any(Object),
    );
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-2",
      expect.objectContaining({
        assigneeAgentId: "a1",
        status: "todo",
      }),
    );
    expect(mockIssueService.addComment).toHaveBeenCalledWith(
      "issue-2",
      expect.stringContaining("operational handoff thread"),
      {},
    );
    expect(mockIssueService.addComment.mock.calls.at(-1)?.[1]).toContain("Canonical technical reference: P4Y-1");
    expect(mockIssueService.addComment.mock.calls.at(-1)?.[1]).toContain("first technical onboarding comment");
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        payload: expect.objectContaining({
          issueId: "issue-2",
        }),
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.updated",
        entityType: "issue",
        entityId: "issue-2",
      }),
    );
  });
});
