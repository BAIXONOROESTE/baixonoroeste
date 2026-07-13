import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stayed unchanged for `delay` ms.
 * Useful to defer expensive work (DB queries, network) until the user
 * stops typing.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
