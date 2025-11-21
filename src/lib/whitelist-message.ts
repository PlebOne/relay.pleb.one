const DEFAULT_RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "wss://relay.pleb.one";
const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://relay.pleb.one";
const DEFAULT_RELAY_NAME = process.env.NEXT_PUBLIC_RELAY_NAME ?? "relay.pleb.one";

export type WhitelistDmMessageConfig = {
  relayUrl?: string;
  loginUrl?: string;
  relayName?: string;
};

export function buildWhitelistDmMessage(config?: WhitelistDmMessageConfig) {
  const relayUrl = config?.relayUrl ?? DEFAULT_RELAY_URL;
  const defaultLoginUrl = `${DEFAULT_APP_URL.replace(/\/$/, "")}/login`;
  const loginUrl = config?.loginUrl ?? defaultLoginUrl;
  const relayName = config?.relayName ?? DEFAULT_RELAY_NAME;

  return [
    `You have been whitelisted on ${relayName}!`,
    `Relay: ${relayUrl}`,
    `Login: ${loginUrl}`,
    "Welcome aboard — reply if you need help.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStatusChangeDmMessage(status: "ACTIVE" | "PAUSED" | "REVOKED", reason?: string) {
  const relayName = process.env.NEXT_PUBLIC_RELAY_NAME ?? "relay.pleb.one";
  const appealUrl = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://relay.pleb.one").replace(/\/$/, "")}/appeal`;

  switch (status) {
    case "ACTIVE":
      return `Your access to ${relayName} has been reinstated. Welcome back!`;
    case "PAUSED":
      return `Your access to ${relayName} has been temporarily paused.${reason ? `\nReason: ${reason}` : ""}\n\nIf you believe this is a mistake, you can appeal here: ${appealUrl}`;
    case "REVOKED":
      return `Your access to ${relayName} has been revoked.${reason ? `\nReason: ${reason}` : ""}\n\nIf you believe this is a mistake, you can appeal here: ${appealUrl}`;
    default:
      return `Your status on ${relayName} has changed to ${status}.`;
  }
}
