// Deterministic governance evaluator (doc §2.2/§20/§96): no LLM anywhere in this file.
// Policies are matched and scored by specificity; the most specific match wins, and ties
// break toward the most restrictive decision (fail closed).

export type Decision = "ALLOW" | "HITL_REQUIRED" | "HARD_DENY";
export type HitlType = "HITL_API_ACCESS" | "HITL_DATA_ACCESS" | "HITL_ETL_EXECUTION";

export interface PolicyRow {
  id: string;
  resourceType: string;
  resourceMatch: Record<string, unknown>;
  role: string | null;
  team: string | null;
  action: string;
  decision: string;
  hitlType: string | null;
  reason: string | null;
}

export interface GovernanceSubject {
  role: string;
  team: string;
}

export interface GovernanceResource {
  resourceType: "api" | "data_asset";
  resourceId: string;
  classification: string;
  action: string;
}

export interface GovernanceResult {
  decision: Decision;
  hitlType?: HitlType;
  reason: string;
  matchedPolicyId?: string;
}

const RESTRICTIVENESS: Record<string, number> = { HARD_DENY: 3, HITL_REQUIRED: 2, ALLOW: 1 };

function scorePolicy(policy: PolicyRow, resource: GovernanceResource, subject: GovernanceSubject): number | null {
  if (policy.resourceType !== resource.resourceType) return null;
  if (policy.action !== resource.action) return null;

  const match = policy.resourceMatch ?? {};
  let score = 0;

  const idMatch = typeof match.resourceId === "string" && match.resourceId === resource.resourceId;
  const classificationMatch =
    typeof match.classification === "string" && match.classification === resource.classification;

  if (!idMatch && !classificationMatch) return null;
  if (idMatch) score += 100;
  if (classificationMatch) score += 10;

  if (policy.role) {
    if (policy.role !== subject.role) return null;
    score += 5;
  }
  if (policy.team) {
    if (policy.team !== subject.team) return null;
    score += 3;
  }

  return score;
}

/**
 * Pure function: given a resource + subject + the full policy set, return a decision.
 * Fails closed — if nothing matches, HARD_DENY.
 */
export function evaluateGovernance(
  resource: GovernanceResource,
  subject: GovernanceSubject,
  policies: PolicyRow[],
): GovernanceResult {
  let best: { policy: PolicyRow; score: number } | null = null;

  for (const policy of policies) {
    const score = scorePolicy(policy, resource, subject);
    if (score === null) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        RESTRICTIVENESS[policy.decision] > RESTRICTIVENESS[best.policy.decision])
    ) {
      best = { policy, score };
    }
  }

  if (!best) {
    return { decision: "HARD_DENY", reason: "No governing policy found for this resource (fail closed)." };
  }

  return {
    decision: best.policy.decision as Decision,
    hitlType: (best.policy.hitlType as HitlType) ?? undefined,
    reason: best.policy.reason ?? `Matched policy "${best.policy.id}".`,
    matchedPolicyId: best.policy.id,
  };
}
