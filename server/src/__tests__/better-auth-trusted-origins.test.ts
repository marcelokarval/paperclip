import { describe, expect, it } from "vitest";
import { deriveAuthTrustedOrigins } from "../auth/better-auth.js";
import type { Config } from "../config.js";

function createConfig(overrides: Partial<Config>): Config {
  return {
    authBaseUrlMode: "auto",
    authPublicBaseUrl: undefined,
    deploymentMode: "authenticated",
    allowedHostnames: [],
    ...overrides,
  } as Config;
}

describe("deriveAuthTrustedOrigins", () => {
  it("does not trust HTTP origins for allowed hostnames in HTTPS deployments", () => {
    const trustedOrigins = deriveAuthTrustedOrigins(
      createConfig({
        authBaseUrlMode: "explicit",
        authPublicBaseUrl: "https://example.com",
        allowedHostnames: ["example.com"],
      }),
    );

    expect(trustedOrigins).toContain("https://example.com");
    expect(trustedOrigins).not.toContain("http://example.com");
  });

  it("trusts HTTP origins for allowed hostnames when the explicit base URL is HTTP", () => {
    const trustedOrigins = deriveAuthTrustedOrigins(
      createConfig({
        authBaseUrlMode: "explicit",
        authPublicBaseUrl: "http://example.com",
        allowedHostnames: ["example.com"],
      }),
    );

    expect(trustedOrigins).toContain("http://example.com");
    expect(trustedOrigins).not.toContain("https://example.com");
  });
});
