import type { NewsroomPolicy } from "./types.ts";

export type Submission = { category: string; sizeBytes: number; hasAttachment: boolean };
export type SubmissionRefusalCode = "category_not_allowed" | "too_large" | "attachments_not_allowed" | "invalid_size";
export type SubmissionCheck = { ok: true } | { ok: false; code: SubmissionRefusalCode; message: string };

/** Checks a submission against the newsroom's policy. */
export function validateSubmission(policy: NewsroomPolicy, s: Submission): SubmissionCheck {
  if (!Number.isInteger(s.sizeBytes) || s.sizeBytes < 1) {
    return { ok: false, code: "invalid_size", message: "The tip size is invalid or empty." };
  }
  if (!policy.categories.includes(s.category)) {
    return { ok: false, code: "category_not_allowed", message: `The category "${s.category}" is not accepted by this newsroom.` };
  }
  if (s.hasAttachment && !policy.attachments) {
    return { ok: false, code: "attachments_not_allowed", message: "This newsroom does not accept attachments." };
  }
  if (s.sizeBytes > policy.maxBytes) {
    return { ok: false, code: "too_large", message: `The tip exceeds the maximum size of ${policy.maxBytes} bytes.` };
  }
  return { ok: true };
}
