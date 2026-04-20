// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildCompanySetupCreatePayload,
  canEnterOnboardingStep,
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
});
