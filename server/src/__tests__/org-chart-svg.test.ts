import { describe, expect, it } from "vitest";

import { renderOrgChartSvg, type OrgNode } from "../routes/org-chart-svg.js";

function chain(length: number): OrgNode[] {
  let root: OrgNode = {
    id: "node-0",
    name: "Node 0",
    role: "Agent",
    status: "active",
    reports: [],
  };

  let cursor = root;
  for (let i = 1; i < length; i += 1) {
    const next: OrgNode = {
      id: `node-${i}`,
      name: `Node ${i}`,
      role: "Agent",
      status: "active",
      reports: [],
    };
    cursor.reports.push(next);
    cursor = next;
  }

  return [root];
}

describe("renderOrgChartSvg", () => {
  it("renders a normal org tree", () => {
    const svg = renderOrgChartSvg(chain(5));
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("fails fast for excessively deep org charts", () => {
    expect(() => renderOrgChartSvg(chain(200))).toThrow(/depth exceeds limit/i);
  });
});
