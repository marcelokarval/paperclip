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
  it("trusts only the explicit base URL protocol for allowed hostname port variants", () => {
    const trustedOrigins = deriveAuthTrustedOrigins(
      createConfig({
        authBaseUrlMode: "explicit",
        authPublicBaseUrl: "https://example.com",
        allowedHostnames: ["example.com"],
      }),
      { listenPort: 3101 },
    );

    expect(trustedOrigins).toContain("https://example.com");
    expect(trustedOrigins).toContain("https://example.com:3101");
    expect(trustedOrigins).not.toContain("http://example.com");
    expect(trustedOrigins).not.toContain("http://example.com:3101");
  });

  it("does not add default-port variants", () => {
    const trustedOrigins = deriveAuthTrustedOrigins(
      createConfig({
        authBaseUrlMode: "explicit",
        authPublicBaseUrl: "http://example.com",
        allowedHostnames: ["example.com"],
      }),
      { listenPort: 443 },
    );

    expect(trustedOrigins).toContain("http://example.com");
    expect(trustedOrigins).not.toContain("http://example.com:443");
    expect(trustedOrigins).not.toContain("https://example.com");
    expect(trustedOrigins).not.toContain("https://example.com:443");
  });
});
