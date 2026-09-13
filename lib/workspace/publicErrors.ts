import {
  publicAuthorizationMessage,
  type AuthorizationResult,
} from "@/domain/authorization/types";
import type { WorkspaceFailureStatus } from "@/lib/workspace/types";

/**
 * Caller-facing copy only. Cross-tenant misses share the same text as other
 * project denials so another company's project is not revealed.
 */
export function publicWorkspaceMessage(status: WorkspaceFailureStatus): string {
  switch (status) {
    case "InvalidProjectData":
      return "This project cannot be opened.";
    case "DatabaseUnavailable":
      return "Project data is unavailable.";
    case "InvalidPersistedOperationalData":
    case "ReconstructionFailure":
      return "Operational history could not be reconstructed.";
    default:
      return publicAuthorizationMessage({
        status,
      } as AuthorizationResult);
  }
}

export function workspaceFailureTitle(status: WorkspaceFailureStatus): string {
  switch (status) {
    case "Unauthenticated":
      return "Sign in required";
    case "ActiveOrganizationRequired":
    case "InvalidActiveOrganization":
      return "Select an organization";
    case "NotOrganizationMember":
    case "UnknownIdentity":
      return "Organization access required";
    case "InvalidProjectData":
      return "Project cannot be opened";
    case "InvalidPersistedOperationalData":
    case "ReconstructionFailure":
      return "Operational history cannot be opened";
    case "DatabaseUnavailable":
      return "Project data unavailable";
    default:
      return "Project access denied";
  }
}
