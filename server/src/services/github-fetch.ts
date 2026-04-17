import { unprocessable } from "../errors.js";

function isGitHubDotCom(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "github.com" || h === "www.github.com";
}

function readAllowedGitHubHosts() {
  const configuredHosts = (process.env.PAPERCLIP_ALLOWED_GITHUB_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(["github.com", "www.github.com", ...configuredHosts]);
}

export function assertAllowedGitHubHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    throw unprocessable("GitHub source URL must include a hostname");
  }
  if (!readAllowedGitHubHosts().has(normalized)) {
    throw unprocessable(
      "GitHub source URL hostname is not allowed. Set PAPERCLIP_ALLOWED_GITHUB_HOSTS to allow a GitHub Enterprise host.",
    );
  }
  return normalized;
}

export function gitHubApiBase(hostname: string) {
  return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}

export function resolveRawGitHubUrl(hostname: string, owner: string, repo: string, ref: string, filePath: string) {
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

export async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw unprocessable(`Could not connect to ${new URL(url).hostname} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
  }
}
