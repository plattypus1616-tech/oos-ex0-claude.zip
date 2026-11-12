"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Custom hook for persistent state with deferred state architecture.
 * 
 * 1. Initial render (Server & Client) MUST be identical using initialValue to prevent hydration mismatch.
 * 2. Read localStorage ONLY after component has successfully mounted on Client.
 * 3. Write to localStorage whenever state (value) changes after the mount phase is complete.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (value: T | ((prev: T) => T)) => void] {
  // 1. Initial render (Server & Client) MUST be identical using initialValue
  const [value, setValue] = useState<T>(initialValue);
  const isHydratedRef = useRef(false);

  // 2. Read localStorage ONLY after component has successfully mounted on Client
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = window.localStorage.getItem(key);
        if (saved) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setValue(JSON.parse(saved));
        }
      }
    } catch (error) {
      console.error(`Failed to read ${key} from localStorage:`, error);
    } finally {
      isHydratedRef.current = true;
    }
  }, [key]);

  // 3. Write to localStorage whenever state (value) changes
  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error(`Failed to save ${key} to localStorage:`, error);
    }
  }, [key, value]);

  return [value, setValue];
}





