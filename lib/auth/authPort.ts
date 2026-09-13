import type { AuthenticatedIdentity } from "@/domain/authorization/types";

/**
 * Application auth port. Never pass Auth.js Session into domain engines.
 */
export type AuthPortSession = {
  userId: string;
  email: string;
  displayName: string | null;
};

export function toAuthPortIdentity(
  session: {
    user?: {
      id?: string | null;
      email?: string | null;
      name?: string | null;
    } | null;
  } | null,
): AuthenticatedIdentity | null {
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email) {
    return null;
  }
  return {
    userId,
    email,
    displayName: session.user?.name ?? null,
  };
}
