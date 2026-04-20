import { createCompanySchema, updateCompanySchema } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";

describe("company validators", () => {
  it("normalizes setup issuePrefix on company creation", () => {
    expect(
      createCompanySchema.parse({
        name: "Prop4You",
        issuePrefix: "p4y",
      }).issuePrefix,
    ).toBe("P4Y");
  });

  it("strips issuePrefix from company updates", () => {
    expect(
      updateCompanySchema.parse({
        issuePrefix: "P4Y",
      }),
    ).toEqual({});
  });
});
