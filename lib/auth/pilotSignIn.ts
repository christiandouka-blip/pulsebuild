/**
 * Pilot presentation contract. Magic-link architecture remains available
 * for demo/test. Production Auth.js does not register the Email provider.
 */

export const PILOT_SIGN_IN_DESCRIPTION =
  "Microsoft Entra ID is the only sign-in method for this pilot.";

export function isMagicLinkPresentedToPilot(entraOnly: boolean): boolean {
  return !entraOnly;
}
