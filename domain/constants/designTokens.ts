/** Documented design tokens — Source of Truth §15 */
export const designTokens = {
  commandNavy: "#0B1220",
  steelBlue: "#1E4E8C",
  signalCyan: "#27D3FF",
  safetyRed: "#E5484D",
  warningAmber: "#F59E0B",
  buildGreen: "#2FBF71",
  concreteGray: "#E5E7EB",
  slateText: "#111827",
  mutedText: "#6B7280",
} as const;

/** Implementation-level surface token — consistent with premium dark-mode command center (SoT §15) */
export const surfaceTokens = {
  card: "#141E2E",
  cardBorder: "rgba(229, 231, 235, 0.12)",
  elevated: "#1A2438",
} as const;
