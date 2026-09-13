export {
  CAPABILITIES,
  capabilitiesForRole,
  roleHasCapability,
  type Capability,
} from "@/domain/authorization/capabilities";
export {
  authorizeOrganizationCapability,
  authorizeProjectAccess,
  deriveTenantScope,
  hasAssignedProjectAccess,
  resolveActiveOrganization,
  roleRequiresProjectAssignment,
  type ActiveOrganizationResolution,
  type OrganizationCapabilityFacts,
  type ProjectAuthorizationFacts,
} from "@/domain/authorization/policy";
export {
  isAuthorized,
  publicAuthorizationMessage,
  type AuthenticatedIdentity,
  type AuthorizationDenial,
  type AuthorizationResult,
  type AuthorizationStatus,
  type AuthorizedAccess,
} from "@/domain/authorization/types";
