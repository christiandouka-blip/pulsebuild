import type { EmailConfig } from "next-auth/providers/email";

import { MagicLinkTransportNotConfiguredError } from "@/lib/auth/magicLink";

/**
 * Auth.js magic-link provider without selecting an email vendor.
 * sendVerificationRequest is the transport boundary; it fails closed until
 * Product Owner approves a production delivery provider.
 */
export function createMagicLinkProvider(): EmailConfig {
  return {
    id: "email",
    name: "Email",
    type: "email",
    maxAge: 24 * 60 * 60,
    sendVerificationRequest: async () => {
      throw new MagicLinkTransportNotConfiguredError();
    },
  };
}
