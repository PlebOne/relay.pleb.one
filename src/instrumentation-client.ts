// Sentry init for the browser. NEXT_PUBLIC_* values are inlined at build time.
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry-options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init(sentryOptions(dsn, process.env.NEXT_PUBLIC_SENTRY_RELEASE));
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
