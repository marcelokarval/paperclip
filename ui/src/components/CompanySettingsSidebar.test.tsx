// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/router";
import { CompanySettingsSidebar } from "./CompanySettingsSidebar";

const companyState = vi.hoisted(() => ({
  selectedCompany: { name: "Acme", issuePrefix: "ACME" },
}));

const sidebarState = vi.hoisted(() => ({
  isMobile: false,
  setSidebarOpen: vi.fn(),
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => companyState,
}));

vi.mock("@/context/SidebarContext", () => ({
  useSidebar: () => sidebarState,
}));

vi.mock("./SidebarCompanyMenu", () => ({
  SidebarCompanyMenu: () => <button type="button">Acme workspace</button>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("CompanySettingsSidebar", () => {
  it("keeps local company settings sections reachable without split settings routes", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/ACME/company/settings"]}>
          <CompanySettingsSidebar />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Company Settings");
    expect(container.querySelector('a[href="/ACME/dashboard"]')?.textContent).toContain("Acme");
    expect(container.querySelector('a[href="/ACME/company/settings#general"]')?.textContent).toContain("General");
    expect(container.querySelector('a[href="/ACME/company/settings#hiring"]')?.textContent).toContain("Hiring");
    expect(container.querySelector('a[href="/ACME/company/settings#labels"]')?.textContent).toContain("Labels");
    expect(container.querySelector('a[href="/ACME/company/settings#feedback-sharing"]')?.textContent).toContain("Feedback");
    expect(container.querySelector('a[href="/ACME/company/settings#invites"]')?.textContent).toContain("Invites");

    act(() => root.unmount());
    container.remove();
  });
});
