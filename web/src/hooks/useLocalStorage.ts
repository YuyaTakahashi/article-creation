import { useState, useEffect, useCallback } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        try {
            const item = window.localStorage.getItem(key);
            if (item) {
                setStoredValue(JSON.parse(item));
            }
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
        }
    }, [key]);

    const setValue = useCallback((value: T | ((val: T) => T)) => {
        try {
            const valueToStore =
                value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
                // Dispatch custom event to sync with other components in the same tab
                window.dispatchEvent(new CustomEvent("local-storage-sync", { detail: { key, newValue: valueToStore } }));
            }
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, storedValue]);

    // Sync state across different components
    useEffect(() => {
        const handleStorageChange = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail.key === key) {
                setStoredValue(customEvent.detail.newValue);
            }
        };

        // Listen to native storage events (across tabs)
        const handleNativeStorage = (e: StorageEvent) => {
            if (e.key === key && e.newValue) {
                setStoredValue(JSON.parse(e.newValue));
            }
        };

        window.addEventListener("local-storage-sync", handleStorageChange);
        window.addEventListener("storage", handleNativeStorage);
        return () => {
            window.removeEventListener("local-storage-sync", handleStorageChange);
            window.removeEventListener("storage", handleNativeStorage);
        };
    }, [key]);

    return [storedValue, setValue, isMounted] as const;
}
