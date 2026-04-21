// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildAdapterEnvironmentTestSignature,
  buildCompanySetupCreatePayload,
  canEnterOnboardingStep,
  findResumableOnboardingCompany,
} from "./OnboardingWizard";

describe("OnboardingWizard issue prefix setup", () => {
  it("submits an explicit issue prefix from the setup step", async () => {
    expect(buildCompanySetupCreatePayload("Prop4You", "p4y")).toEqual({
      name: "Prop4You",
      issuePrefix: "P4Y",
    });
  });

  it("omits issuePrefix when the setup field is left blank", async () => {
    expect(buildCompanySetupCreatePayload("Paperclip", "")).toEqual({
      name: "Paperclip",
    });
  });

  it("blocks jumping to later steps before their prerequisites exist", () => {
    expect(canEnterOnboardingStep(1, { companyId: null, agentId: null })).toBe(true);
    expect(canEnterOnboardingStep(2, { companyId: null, agentId: null })).toBe(false);
    expect(canEnterOnboardingStep(2, { companyId: "company-1", agentId: null })).toBe(true);
    expect(canEnterOnboardingStep(3, { companyId: "company-1", agentId: null })).toBe(false);
    expect(canEnterOnboardingStep(4, { companyId: "company-1", agentId: "agent-1" })).toBe(true);
  });

  it("finds an existing company so interrupted setup can continue", () => {
    const companies = [
      { id: "company-1", name: "Prop4You", issuePrefix: "P4Y" },
      { id: "company-2", name: "Paperclip", issuePrefix: "PAP" },
      { id: "company-3", name: "Prop4You", issuePrefix: "PRO" },
    ];

    expect(findResumableOnboardingCompany(companies, "prop4you", "")?.id).toBe("company-1");
    expect(findResumableOnboardingCompany(companies, "Different", "p4y")?.id).toBe("company-1");
    expect(findResumableOnboardingCompany(companies, "Prop4You", "NEW")).toBeNull();
    expect(findResumableOnboardingCompany(companies, "Unknown", "UNK")).toBeNull();
  });

  it("keys adapter environment test reuse by company, adapter, and config", () => {
    const first = buildAdapterEnvironmentTestSignature({
      companyId: "company-1",
      adapterType: "codex_local",
      adapterConfig: {
        env: { B: "2", A: "1" },
        model: "gpt-5.4",
      },
    });
    const sameConfigDifferentKeyOrder = buildAdapterEnvironmentTestSignature({
      companyId: "company-1",
      adapterType: "codex_local",
      adapterConfig: {
        model: "gpt-5.4",
        env: { A: "1", B: "2" },
      },
    });
    const changedModel = buildAdapterEnvironmentTestSignature({
      companyId: "company-1",
      adapterType: "codex_local",
      adapterConfig: {
        env: { A: "1", B: "2" },
        model: "gpt-5.3-codex",
      },
    });

    expect(sameConfigDifferentKeyOrder).toBe(first);
    expect(changedModel).not.toBe(first);
  });
});
