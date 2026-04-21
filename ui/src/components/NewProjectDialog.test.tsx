// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewProjectDialog } from "./NewProjectDialog";

const dialogState = vi.hoisted(() => ({
  newProjectOpen: true,
  closeNewProject: vi.fn(),
}));

const companyState = vi.hoisted(() => ({
  selectedCompanyId: "company-1",
  selectedCompany: {
    id: "company-1",
    name: "Paperclip",
    status: "active",
    brandColor: "#123456",
    issuePrefix: "PAP",
  },
}));

const mockProjectsApi = vi.hoisted(() => ({
  create: vi.fn(),
  createWorkspace: vi.fn(),
}));

const mockGoalsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockAgentsApi = vi.hoisted(() => ({
  list: vi.fn(),
}));

const mockAssetsApi = vi.hoisted(() => ({
  uploadImage: vi.fn(),
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => dialogState,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("../api/projects", () => ({
  projectsApi: mockProjectsApi,
}));

vi.mock("../api/goals", () => ({
  goalsApi: mockGoalsApi,
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/assets", () => ({
  assetsApi: mockAssetsApi,
}));

vi.mock("./MarkdownEditor", async () => {
  const React = await import("react");
  return {
    MarkdownEditor: React.forwardRef<
      { focus: () => void },
      { value: string; onChange?: (value: string) => void; placeholder?: string }
    >(function MarkdownEditorMock({ value, onChange, placeholder }, ref) {
      React.useImperativeHandle(ref, () => ({
        focus: () => undefined,
      }));
      return (
        <textarea
          aria-label={placeholder ?? "Description"}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      );
    }),
  };
});

vi.mock("./PathInstructionsModal", () => ({
  ChoosePathButton: () => <button type="button">Choose path</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: ComponentProps<"div"> & { showCloseButton?: boolean }) => <div {...props}>{children}</div>,
  DialogTitle: ({ children, ...props }: ComponentProps<"h2">) => <h2 {...props}>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type = "button", ...props }: ComponentProps<"button">) => (
    <button type={type} onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderDialog(container: HTMLDivElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <NewProjectDialog />
      </QueryClientProvider>,
    );
  });
  return { root };
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(label));
  expect(button).not.toBeUndefined();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("NewProjectDialog", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    dialogState.newProjectOpen = true;
    dialogState.closeNewProject.mockReset();
    mockProjectsApi.create.mockReset();
    mockProjectsApi.createWorkspace.mockReset();
    mockProjectsApi.create.mockResolvedValue({ id: "project-1", name: "Launch" });
    mockGoalsApi.list.mockResolvedValue([]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockAssetsApi.uploadImage.mockResolvedValue({ contentPath: "/uploads/asset.png" });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a repo-only project with a primary git workspace and no separate workspace call", async () => {
    const { root } = renderDialog(container);
    await flush();

    setInputValue(container.querySelector('input[placeholder="Project name"]')!, "Launch");
    clickButton(container, "GitHub repo");
    setInputValue(container.querySelector('input[placeholder="https://github.com/org/repo"]')!, "https://github.com/acme/launch");
    clickButton(container, "Create project");
    await flush();

    expect(mockProjectsApi.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        name: "Launch",
        workspace: expect.objectContaining({
          name: "launch",
          sourceType: "git_repo",
          repoUrl: "https://github.com/acme/launch",
          isPrimary: true,
        }),
      }),
    );
    expect(mockProjectsApi.createWorkspace).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("creates a project without workspace binding when no codebase is selected", async () => {
    const { root } = renderDialog(container);
    await flush();

    setInputValue(container.querySelector('input[placeholder="Project name"]')!, "Operations");
    clickButton(container, "No codebase yet");
    clickButton(container, "Create project");
    await flush();

    expect(mockProjectsApi.create).toHaveBeenCalledWith(
      "company-1",
      expect.not.objectContaining({
        workspace: expect.anything(),
      }),
    );
    expect(mockProjectsApi.createWorkspace).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("creates a local plus GitHub project workspace when both values are selected", async () => {
    const { root } = renderDialog(container);
    await flush();

    setInputValue(container.querySelector('input[placeholder="Project name"]')!, "Paperclip Fork");
    clickButton(container, "Local + GitHub");
    setInputValue(container.querySelector('input[placeholder="/absolute/path/to/workspace"]')!, "/home/me/paperclip");
    setInputValue(container.querySelector('input[placeholder="https://github.com/org/repo"]')!, "https://github.com/me/paperclip");
    clickButton(container, "Create project");
    await flush();

    expect(mockProjectsApi.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        name: "Paperclip Fork",
        workspace: expect.objectContaining({
          name: "paperclip",
          sourceType: "git_repo",
          cwd: "/home/me/paperclip",
          repoUrl: "https://github.com/me/paperclip",
          isPrimary: true,
        }),
      }),
    );

    act(() => root.unmount());
  });
});
