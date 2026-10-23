import type { CaseStatus } from "@checkiq/contracts";
import { invalidTransition } from "../../lib/errors.js";

/**
 * The authoritative case state machine.
 *
 * Transitions are validated on the server. The React client mirrors these
 * rules for affordance only — it is never the enforcement point.
 *
 * See `docs/04-workflows-and-state-machine.md` for the rationale behind each
 * rule.
 */

export interface TransitionRule {
  to: CaseStatus;
  /** Roles permitted to perform the transition. */
  actors: string[];
  /** Human-readable precondition that must hold before the transition. */
  requires: string;
}

export const CASE_TRANSITIONS: Record<CaseStatus, TransitionRule[]> = {
  DRAFT: [
    {
      to: "DOCUMENT_UPLOAD_IN_PROGRESS",
      actors: ["SYSTEM"],
      requires: "A candidate account exists for the case",
    },
  ],
  BGV_INVITED: [
    {
      to: "REGISTRATION_PENDING",
      actors: ["SYSTEM", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "Invitation workflow is enabled (not used by the open-signup MVP)",
    },
    {
      to: "DOCUMENT_UPLOAD_IN_PROGRESS",
      actors: ["SYSTEM", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "Invitation workflow is enabled (not used by the open-signup MVP)",
    },
  ],
  REGISTRATION_PENDING: [
    {
      to: "DOCUMENT_UPLOAD_IN_PROGRESS",
      actors: ["SYSTEM", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "The candidate has started the registration flow",
    },
  ],
  DOCUMENT_UPLOAD_IN_PROGRESS: [
    {
      to: "SUBMITTED",
      actors: ["CANDIDATE"],
      requires:
        "Profile complete, all mandatory documents present, current consent accepted, idempotency key supplied",
    },
  ],
  SUBMITTED: [
    {
      to: "VERIFICATION_IN_PROGRESS",
      actors: ["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A verifier is assigned",
    },
    {
      to: "CLARIFICATION_REQUIRED",
      actors: ["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A clarification request is raised before verification begins",
    },
  ],
  VERIFICATION_IN_PROGRESS: [
    {
      to: "CLARIFICATION_REQUIRED",
      actors: ["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "At least one clarification request is open",
    },
    {
      to: "VERIFICATION_COMPLETED",
      actors: ["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "All mandatory checks are resolved and no clarification is open",
    },
    {
      to: "BGV_REVIEW_REQUIRED",
      actors: ["BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A check recorded a discrepancy that requires review",
    },
  ],
  CLARIFICATION_REQUIRED: [
    {
      to: "VERIFICATION_IN_PROGRESS",
      actors: ["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "Every open clarification has been responded to or closed",
    },
    {
      to: "BGV_REVIEW_REQUIRED",
      actors: ["BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A discrepancy requiring review exists",
    },
  ],
  VERIFICATION_COMPLETED: [
    {
      to: "BGV_SCORE_GENERATED",
      actors: ["SYSTEM"],
      requires: "A score was computed with an approved scoring configuration",
    },
    {
      to: "BGV_REVIEW_REQUIRED",
      actors: ["BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A reviewer requested further review before scoring",
    },
  ],
  BGV_SCORE_GENERATED: [
    {
      to: "BGV_REVIEW_REQUIRED",
      actors: ["SYSTEM", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "The score is below the configured threshold",
    },
    {
      to: "BGV_APPROVED",
      actors: ["BGV_REVIEWER", "HR_RECRUITMENT"],
      requires:
        "Score at or above threshold, maker-checker satisfied, no open clarifications, approver is not the maker",
    },
  ],
  BGV_REVIEW_REQUIRED: [
    {
      to: "BGV_APPROVED",
      actors: ["BGV_REVIEWER", "HR_RECRUITMENT"],
      requires: "A reviewer decision approves the case and the maker-checker rule is satisfied",
    },
    {
      to: "BELOW_BGV_ELIGIBILITY_THRESHOLD",
      actors: ["BGV_REVIEWER"],
      requires: "A reviewer confirms the case is below the threshold",
    },
    {
      to: "VERIFICATION_IN_PROGRESS",
      actors: ["BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A reviewer returns the case for further work, with a reason",
    },
  ],
  BELOW_BGV_ELIGIBILITY_THRESHOLD: [
    {
      to: "BGV_APPROVED",
      actors: ["BGV_REVIEWER"],
      requires: "An approver overrides the outcome, with a reason",
    },
    {
      to: "VERIFICATION_IN_PROGRESS",
      actors: ["BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "A reviewer returns the case for further work, with a reason",
    },
  ],
  BGV_APPROVED: [
    {
      to: "ELIGIBLE_FOR_FINAL_INTERVIEW",
      actors: ["BGV_REVIEWER", "HR_RECRUITMENT", "SUPER_ADMINISTRATOR"],
      requires: "The approval is recorded",
    },
    {
      to: "CLOSED",
      actors: ["BGV_REVIEWER", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "The outcome has been recorded and notifications dispatched",
    },
  ],
  ELIGIBLE_FOR_FINAL_INTERVIEW: [
    {
      to: "CLOSED",
      actors: ["BGV_REVIEWER", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"],
      requires: "The case is complete",
    },
  ],
  CLOSED: [],
};

/** Statuses a candidate is allowed to observe, with the wording shown to them. */
export const CANDIDATE_VISIBLE_STATUSES: Record<CaseStatus, string> = {
  DRAFT: "Registration",
  BGV_INVITED: "Registration",
  REGISTRATION_PENDING: "Registration",
  DOCUMENT_UPLOAD_IN_PROGRESS: "Action required",
  SUBMITTED: "Submitted",
  VERIFICATION_IN_PROGRESS: "In progress",
  CLARIFICATION_REQUIRED: "Action required",
  VERIFICATION_COMPLETED: "In progress",
  BGV_SCORE_GENERATED: "In progress",
  BGV_REVIEW_REQUIRED: "In progress",
  BELOW_BGV_ELIGIBILITY_THRESHOLD: "Completed",
  BGV_APPROVED: "Completed",
  ELIGIBLE_FOR_FINAL_INTERVIEW: "Completed",
  CLOSED: "Completed",
};

/**
 * Asserts that a transition is permitted.
 * Throws `INVALID_STATE_TRANSITION` with the allowed alternatives.
 */
export function assertTransition(
  from: CaseStatus,
  to: CaseStatus,
  actorRoles: string[],
): TransitionRule {
  const rules = CASE_TRANSITIONS[from] ?? [];
  const rule = rules.find((candidate) => candidate.to === to);
  if (!rule) {
    throw invalidTransition(
      `A case cannot move from ${from} to ${to}.`,
      { from, to, allowed: rules.map((candidate) => candidate.to) },
    );
  }
  const permitted = rule.actors.includes("SYSTEM") || rule.actors.some((role) => actorRoles.includes(role));
  if (!permitted) {
    throw invalidTransition(
      `Your role is not permitted to move a case from ${from} to ${to}.`,
      { from, to, requiredRoles: rule.actors },
    );
  }
  return rule;
}

/** Returns the statuses a given set of roles may move the case to. */
export function allowedTransitions(from: CaseStatus, actorRoles: string[]): CaseStatus[] {
  return (CASE_TRANSITIONS[from] ?? [])
    .filter((rule) => rule.actors.includes("SYSTEM") || rule.actors.some((role) => actorRoles.includes(role)))
    .map((rule) => rule.to);
}
