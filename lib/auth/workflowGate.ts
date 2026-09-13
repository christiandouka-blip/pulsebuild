import { isAuthorized } from "@/domain/authorization/types";
import type { AuthorizationResult } from "@/domain/authorization/types";

/**
 * Invoke a workflow command only after authorization succeeds.
 * Does not import Phase 3 FSM/transition helpers.
 */
export function runAuthorizedWorkflow<T>(
  authorization: AuthorizationResult,
  workflow: () => T,
): { status: "invoked"; value: T } | AuthorizationResult {
  if (!isAuthorized(authorization)) {
    return authorization;
  }
  return { status: "invoked", value: workflow() };
}
