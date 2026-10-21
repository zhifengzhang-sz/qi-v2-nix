// The kit's own Result and error: failure is a value (dev/ts/STYLE.md); the kit is a product of its own and
// takes no package of this project (the owner, 2026-10-16: self-contained), so this is the smallest Result it needs.
// Its edge runs its effects as async functions returning a Result, not as Tasks: one command, run once, in
// src/edge/main.ts; the departure from the rule is this, and the reviewer reads for it.

export type Result<T, E = KitError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const map =
  <T, U>(f: (t: T) => U) =>
  <E>(r: Result<T, E>): Result<U, E> =>
    r.ok ? ok(f(r.value)) : r;

export const chain =
  <T, U, E>(f: (t: T) => Result<U, E>) =>
  (r: Result<T, E>): Result<U, E> =>
    r.ok ? f(r.value) : r;

export const match =
  <T, E, A>(onOk: (t: T) => A, onErr: (e: E) => A) =>
  (r: Result<T, E>): A =>
    r.ok ? onOk(r.value) : onErr(r.error);

// every value, or the first error
export const all = <T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], E> =>
  rs.reduce<Result<readonly T[], E>>(
    (acc, r) => (acc.ok ? (r.ok ? ok([...acc.value, r.value]) : r) : acc),
    ok([]),
  );

export const KIT_ERRORS = [
  "SPEC_INVALID",
  "FILE_UNREADABLE",
  "FILE_UNWRITABLE",
  "KIND_UNKNOWN",
  "ARGS_INVALID",
  "RUN_OUTSIDE",
] as const;
export type KitCode = (typeof KIT_ERRORS)[number];

export type KitError = { readonly code: KitCode; readonly message: string; readonly where: string };

export const kitError = (code: KitCode, where: string, message: string): KitError => ({
  code,
  message,
  where,
});
