import { scrubBreadcrumb, scrubEvent, scrubSpan } from "@/lib/sentry-scrub";

/**
 * Options shared by every Sentry runtime (server, edge, browser).
 * Errors plus light tracing only: no replay, profiling, logs or feedback.
 * With an empty DSN Sentry stays disabled (no client, no network).
 */
export function sentryOptions(dsn: string | undefined, release: string | undefined) {
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: release || undefined,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    // Spans are streamed by default in v11 (beforeSendTransaction is not called).
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
