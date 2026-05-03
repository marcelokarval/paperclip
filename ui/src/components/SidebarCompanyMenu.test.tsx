// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "@/lib/router";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

const companyState = vi.hoisted(() => ({
  companies: [
    { id: "company-1", name: "Acme", issuePrefix: "ACME", status: "active", logoUrl: null, brandColor: "#123456" },
    { id: "company-2", name: "Beta", issuePrefix: "BETA", status: "active", logoUrl: null, brandColor: null },
    { id: "company-3", name: "Old", issuePrefix: "OLD", status: "archived", logoUrl: null, brandColor: null },
  ],
  selectedCompany: { id: "company-1", name: "Acme", issuePrefix: "ACME", status: "active", logoUrl: null, brandColor: "#123456" },
  setSelectedCompanyId: vi.fn(),
}));

const dialogState = vi.hoisted(() => ({
  openOnboarding: vi.fn(),
}));

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  setSidebarOpen: vi.fn(),
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => dialogState,
}));

vi.mock("@/context/SidebarContext", () => ({
  useSidebar: () => sidebarState,
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    getSession: vi.fn().mockResolvedValue({ session: null }),
    signOut: vi.fn(),
  },
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./CompanyPatternIcon", () => ({
  CompanyPatternIcon: ({ companyName }: { companyName: string }) => <span>{companyName.slice(0, 1)}</span>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderMenu() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/ACME/dashboard"]}>
          <SidebarCompanyMenu />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });

  return { container, root, queryClient };
}

describe("SidebarCompanyMenu", () => {
  it("uses real company-prefixed links and switches workspaces from company routes", () => {
    const { container, root, queryClient } = renderMenu();

    expect(container.textContent).toContain("Switch workspace");
    expect(container.textContent).toContain("Acme");
    expect(container.textContent).toContain("Beta");
    expect(container.textContent).not.toContain("Old");
    expect(container.querySelector('a[href="/ACME/company/settings#invites"]')?.textContent).toContain("Invite people");
    expect(container.querySelector('a[href="/ACME/company/settings"]')?.textContent).toContain("Company settings");

    const betaButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Beta"));
    expect(betaButton).toBeTruthy();

    act(() => {
      betaButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(companyState.setSelectedCompanyId).toHaveBeenCalledWith("company-2");
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/BETA/dashboard");

    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });
});
