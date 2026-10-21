export async function register() {
  // Resource history sampler (Resources dashboard tab). Node runtime only.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startResourceSampler } = await import("@/server/resources/history");
    startResourceSampler();
  }
}
