import { describe, expect, it } from "vitest";
import { evaluateGovernance, type PolicyRow } from "../governance.js";

const financePolicy: PolicyRow = {
  id: "pol-financial-default",
  resourceType: "api",
  resourceMatch: { classification: "FINANCIAL" },
  role: null,
  team: null,
  action: "read",
  decision: "HITL_REQUIRED",
  hitlType: "HITL_API_ACCESS",
  reason: "Financial data requires approval by default.",
};

const financeAnalystOverride: PolicyRow = {
  id: "pol-financial-finance-role",
  resourceType: "api",
  resourceMatch: { classification: "FINANCIAL" },
  role: "FINANCE_ANALYST",
  team: null,
  action: "read",
  decision: "ALLOW",
  hitlType: null,
  reason: "Finance analysts can read financial APIs directly.",
};

const publicPolicy: PolicyRow = {
  id: "pol-public",
  resourceType: "api",
  resourceMatch: { classification: "PUBLIC" },
  role: null,
  team: null,
  action: "read",
  decision: "ALLOW",
  hitlType: null,
  reason: "Public data.",
};

const restrictedPolicy: PolicyRow = {
  id: "pol-restricted",
  resourceType: "api",
  resourceMatch: { classification: "RESTRICTED" },
  role: null,
  team: null,
  action: "read",
  decision: "HARD_DENY",
  hitlType: null,
  reason: "Restricted data is never directly accessible.",
};

describe("evaluateGovernance", () => {
  it("allows a role-specific override to beat the generic classification policy", () => {
    const result = evaluateGovernance(
      { resourceType: "api", resourceId: "revenue", classification: "FINANCIAL", action: "read" },
      { role: "FINANCE_ANALYST", team: "Finance" },
      [financePolicy, financeAnalystOverride, publicPolicy],
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.matchedPolicyId).toBe("pol-financial-finance-role");
  });

  it("falls back to the generic classification policy for other roles", () => {
    const result = evaluateGovernance(
      { resourceType: "api", resourceId: "revenue", classification: "FINANCIAL", action: "read" },
      { role: "ANALYST", team: "Analytics" },
      [financePolicy, financeAnalystOverride, publicPolicy],
    );
    expect(result.decision).toBe("HITL_REQUIRED");
    expect(result.hitlType).toBe("HITL_API_ACCESS");
  });

  it("allows public data for anyone", () => {
    const result = evaluateGovernance(
      { resourceType: "api", resourceId: "products", classification: "PUBLIC", action: "read" },
      { role: "DEVELOPER", team: "Engineering" },
      [financePolicy, publicPolicy],
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("hard-denies restricted data even for admins, unless an explicit override exists", () => {
    const result = evaluateGovernance(
      { resourceType: "api", resourceId: "salary-data", classification: "RESTRICTED", action: "read" },
      { role: "DWH_ADMIN", team: "Data Platform" },
      [restrictedPolicy],
    );
    expect(result.decision).toBe("HARD_DENY");
  });

  it("fails closed (HARD_DENY) when no policy matches at all", () => {
    const result = evaluateGovernance(
      { resourceType: "api", resourceId: "mystery", classification: "UNKNOWN", action: "read" },
      { role: "ANALYST", team: "Analytics" },
      [financePolicy, publicPolicy],
    );
    expect(result.decision).toBe("HARD_DENY");
  });

  it("scopes by team when a policy specifies one", () => {
    const teamPolicy: PolicyRow = {
      id: "pol-team-scoped",
      resourceType: "api",
      resourceMatch: { classification: "FINANCIAL" },
      role: null,
      team: "Data Platform",
      action: "read",
      decision: "ALLOW",
      hitlType: null,
      reason: "Data Platform team can read financial APIs.",
    };
    const allowed = evaluateGovernance(
      { resourceType: "api", resourceId: "revenue", classification: "FINANCIAL", action: "read" },
      { role: "DATA_ENGINEER", team: "Data Platform" },
      [financePolicy, teamPolicy],
    );
    expect(allowed.decision).toBe("ALLOW");

    const notAllowed = evaluateGovernance(
      { resourceType: "api", resourceId: "revenue", classification: "FINANCIAL", action: "read" },
      { role: "DATA_ENGINEER", team: "Engineering" },
      [financePolicy, teamPolicy],
    );
    expect(notAllowed.decision).toBe("HITL_REQUIRED");
  });
});
