import { runRetentionPurge } from "@/lib/retention-purge";

const globalState = globalThis as typeof globalThis & {
  licenseHubRetentionSchedulerStarted?: boolean;
};

function enabled() {
  const configured = process.env.RETENTION_PURGE_ENABLED?.trim().toLowerCase();
  if (configured) {
    return configured === "true" || configured === "1" || configured === "yes";
  }

  return process.env.NODE_ENV === "production";
}

function safeNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, parsed));
}

async function executeScheduledPurge() {
  try {
    const summary = await runRetentionPurge({
      limit: safeNumber(process.env.RETENTION_PURGE_BATCH_SIZE, 25, 1, 100),
    });
    console.log("License Hub retention purge:", JSON.stringify(summary));
  } catch (error) {
    console.error("License Hub retention purge failed:", error);
  }
}

if (enabled() && !globalState.licenseHubRetentionSchedulerStarted) {
  globalState.licenseHubRetentionSchedulerStarted = true;

  const startDelayMs = safeNumber(process.env.RETENTION_PURGE_START_DELAY_SECONDS, 60, 5, 3600) * 1000;
  const intervalMs = safeNumber(process.env.RETENTION_PURGE_INTERVAL_HOURS, 24, 1, 168) * 60 * 60 * 1000;

  const initialTimer = setTimeout(() => void executeScheduledPurge(), startDelayMs);
  const intervalTimer = setInterval(() => void executeScheduledPurge(), intervalMs);
  initialTimer.unref();
  intervalTimer.unref();
}
