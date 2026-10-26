/** Provider acceptance and manual confirmation are not recipient delivery receipts. */
export function whatsappSendLabel(status: string, providerMessageId?: string | null): string {
  if (status === "sent") return providerMessageId ? "Accepted · delivery unknown" : "Manually marked sent · delivery unknown";
  if (status === "pending") return "Queued";
  if (status === "failed") return "Failed";
  return "Skipped";
}