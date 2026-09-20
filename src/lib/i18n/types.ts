import type { sk } from "./sk"

/** Widen `as const` string literals so other locales can satisfy the same shape. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? Widen<U>[]
      : T extends object
        ? { -readonly [K in keyof T]: Widen<T[K]> }
        : T

export type Messages = Widen<typeof sk>

export type LocaleId = "sk" | "en" | "cs" | "de" | "pl" | "hu"
