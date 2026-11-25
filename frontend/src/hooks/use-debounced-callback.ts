// @ts-nocheck
import * as React from "react";

export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;
  return React.useMemo(
    () =>
      ((...args: unknown[]) => {
        const id = setTimeout(() => callbackRef.current(...args), delay);
        return () => clearTimeout(id);
      }) as T,
    [delay]
  );
}
