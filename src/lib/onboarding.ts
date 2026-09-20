import { idbGet, idbSet } from "@/lib/idb"

const ONBOARDING_KEY = "bloom-onboarding-v2"
const PRIVACY_KEY = "bloom-privacy-accepted-v1"

export async function isOnboardingDone(): Promise<boolean> {
  return (await idbGet(ONBOARDING_KEY)) === "1"
}

export async function markOnboardingDone(): Promise<void> {
  await idbSet(ONBOARDING_KEY, "1")
}

export async function isPrivacyAccepted(): Promise<boolean> {
  return (await idbGet(PRIVACY_KEY)) === "1"
}

export async function markPrivacyAccepted(): Promise<void> {
  await idbSet(PRIVACY_KEY, "1")
}
