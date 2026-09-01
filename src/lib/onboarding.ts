import { idbGet, idbSet } from "@/lib/idb"

const ONBOARDING_KEY = "bloom-onboarding-v1"

export async function isOnboardingDone(): Promise<boolean> {
  return (await idbGet(ONBOARDING_KEY)) === "1"
}

export async function markOnboardingDone(): Promise<void> {
  await idbSet(ONBOARDING_KEY, "1")
}
