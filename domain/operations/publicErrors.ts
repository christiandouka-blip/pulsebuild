import {
  publicAuthorizationMessage,
  type AuthorizationResult,
} from "@/domain/authorization/types";
import type { OperationalFailureStatus } from "@/domain/operations/types";

export function publicOperationalMessage(status: OperationalFailureStatus): string {
  switch (status) {
    case "InvalidProjectData":
      return "This project cannot be opened.";
    case "InvalidObservation":
      return "This observation could not be committed.";
    case "InvalidTransition":
      return "This workflow action is not valid.";
    case "PersistenceConflict":
      return "This project was updated by another user. Reload and retry.";
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
