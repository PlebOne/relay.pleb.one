import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Resource history sampler (Resources dashboard tab). Node runtime only.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startResourceSampler } = await import("@/server/resources/history");
    startResourceSampler();
  }

  // Sentry (no-op when SENTRY_DSN is empty).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
