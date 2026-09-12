/**
 * Build an x402 v2 payment payload from a server challenge.
 *
 * The resource is part of the challenge binding. Keeping it in the signed
 * envelope makes the manual client path equivalent to @x402/fetch's standard
 * wrapper and prevents a payment from being detached from the requested URL.
 */
export function buildPaymentPayload(
  challenge: {
    x402Version: number;
    resource?: Record<string, unknown>;
  },
  accepted: Record<string, unknown>,
  payload: Record<string, unknown>,
  extensions?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    x402Version: challenge.x402Version,
    ...(challenge.resource ? { resource: challenge.resource } : {}),
    accepted,
    payload,
    ...(extensions ? { extensions } : {}),
  };
}
