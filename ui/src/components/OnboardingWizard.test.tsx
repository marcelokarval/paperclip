// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { buildCompanySetupCreatePayload } from "./OnboardingWizard";

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
});
