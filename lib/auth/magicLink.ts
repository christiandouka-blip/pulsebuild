export class MagicLinkTransportNotConfiguredError extends Error {
  constructor() {
    super(
      "Magic-link email transport is not configured. A Product Owner decision is required before selecting a production email delivery provider.",
    );
    this.name = "MagicLinkTransportNotConfiguredError";
  }
}
