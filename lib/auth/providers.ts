import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { createMagicLinkProvider } from "@/lib/auth/magicLinkProvider";

export function createAuthProviders(input: {
  production: boolean;
  entraClientId: string;
  entraClientSecret: string;
  entraIssuer?: string;
}) {
  const entra = MicrosoftEntraID({
    clientId: input.entraClientId,
    clientSecret: input.entraClientSecret,
    issuer: input.entraIssuer,
  });

  if (input.production) {
    return [entra];
  }

  return [entra, createMagicLinkProvider()];
}
