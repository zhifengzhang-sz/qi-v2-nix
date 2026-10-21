// Where an exception enters from the file system or a parser in the edge, and becomes a value: the edge's
// one try (dev/ts/STYLE.md: try only at the edge).
import { err, type KitCode, kitError, ok, type Result } from "../result.ts";

export const tryCatch = <T>(code: KitCode, where: string, f: () => T): Result<T> => {
  try {
    return ok(f());
  } catch (e) {
    return err(kitError(code, where, e instanceof Error ? e.message : String(e)));
  }
};

export const tryAsync = async <T>(code: KitCode, where: string, f: () => Promise<T>): Promise<Result<T>> => {
  try {
    return ok(await f());
  } catch (e) {
    return err(kitError(code, where, e instanceof Error ? e.message : String(e)));
  }
};
