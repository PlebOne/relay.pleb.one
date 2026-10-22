// Sentry init for the edge runtime (middleware, edge routes). Loaded from src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry-options";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init(sentryOptions(dsn, process.env.SENTRY_RELEASE));
}
