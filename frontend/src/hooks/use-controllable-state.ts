// @ts-nocheck
import * as React from "react";
export function useControllableState<T>({ prop, defaultProp, onChange }: { prop?: T; defaultProp?: T; onChange?: (v: T) => void }): [T, (v: T | ((prev: T) => T)) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultProp);
  const value = prop !== undefined ? prop : uncontrolled;
  const setValue = React.useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === "function" ? (v as (prev: T) => T)(value) : v;
    if (prop === undefined) setUncontrolled(next);
    onChange?.(next);
  }, [prop, value, onChange]);
  return [value, setValue];
}
