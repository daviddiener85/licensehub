const retentionTriggerStatuses = new Set(["DISPATCHED", "CANCELLED"]);

export function calculateRetentionEligibleAt(
  status: string,
  daysAfterCompletion: number | null | undefined,
  completedAt: Date = new Date(),
) {
  if (!retentionTriggerStatuses.has(status) || daysAfterCompletion == null) {
    return null;
  }

  const retentionEligibleAt = new Date(completedAt);
  retentionEligibleAt.setDate(retentionEligibleAt.getDate() + daysAfterCompletion);
  return retentionEligibleAt;
}

export function formatRetentionSetting(daysAfterCompletion: number | null | undefined) {
  if (daysAfterCompletion == null) {
    return "Awaiting business setting";
  }

  return `${daysAfterCompletion} days after dispatched or cancelled`;
}
