import type { Capability } from "@/domain/authorization/capabilities";
import type { OrganizationRole, TenantScope } from "@/domain/tenancy/types";

export type AuthorizationStatus =
  | "Authorized"
  | "Unauthenticated"
  | "UnknownIdentity"
  | "NotOrganizationMember"
  | "InvalidActiveOrganization"
  | "ActiveOrganizationRequired"
  | "ProjectNotFound"
  | "ProjectAccessDenied"
  | "CapabilityDenied";

export type AuthorizedAccess = {
  status: "Authorized";
  scope: TenantScope;
  role: OrganizationRole;
  capabilities: readonly Capability[];
};

export type AuthorizationDenial = {
  status: Exclude<AuthorizationStatus, "Authorized">;
  capability?: Capability;
};

export type AuthorizationResult = AuthorizedAccess | AuthorizationDenial;

export type AuthenticatedIdentity = {
  userId: string;
  email: string;
  displayName: string | null;
};

export function isAuthorized(
  result: AuthorizationResult,
): result is AuthorizedAccess {
  return result.status === "Authorized";
}

/**
 * Caller-facing copy. Cross-tenant misses use the same text as other denials
 * so existence of another company's project is not leaked.
 */
export function publicAuthorizationMessage(result: AuthorizationResult): string {
  switch (result.status) {
    case "Authorized":
      return "Authorized.";
    case "Unauthenticated":
      return "Authentication required.";
    case "UnknownIdentity":
      return "Authenticated identity is not recognized.";
    case "NotOrganizationMember":
      return "Organization membership is required.";
    case "InvalidActiveOrganization":
      return "Active organization is not valid for this user.";
    case "ActiveOrganizationRequired":
      return "Select an organization.";
    case "ProjectNotFound":
    case "ProjectAccessDenied":
      return "Project access denied.";
    case "CapabilityDenied":
      return "You are not allowed to perform this action.";
  }
}
