import { useState, useEffect, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { GlossaryTerm } from "@/types";

// Client-side cache for history to avoid redundant fetches across pages
let globalHistoryCache: GlossaryTerm[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export function useGlossaryHistory() {
    const [history, setHistory] = useState<GlossaryTerm[]>(globalHistoryCache || []);
    const [isMounted, setIsMounted] = useState(false);
    const [mail, , mailMounted] = useLocalStorage("ux_glossary_user_mail", "");
    const [loading, setLoading] = useState(!globalHistoryCache);

    const fetchHistory = useCallback(async (force = false, isPolling = false) => {
        const now = Date.now();
        if (!force && globalHistoryCache && (now - lastFetchTime < CACHE_TTL)) {
            setHistory(globalHistoryCache);
            if (!isPolling) setLoading(false);
            return;
        }

        try {
            if (!isPolling) setLoading(true);
            const res = await fetch(`/api/history`);
            if (res.ok) {
                const json = await res.json();
                const historyList = json.data?.history || json.history || [];
                setHistory(historyList);
                globalHistoryCache = historyList;
                lastFetchTime = Date.now();
            }
        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, [mail, mailMounted]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted) {
            fetchHistory();
        }
    }, [isMounted, fetchHistory]);

    const addTerm = async (term: GlossaryTerm) => {
        // Optimistic UI update
        const newHistory = [term, ...history];
        setHistory(newHistory);
        globalHistoryCache = newHistory;

        // DB sync
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save_history', historyItem: term })
            });
        } catch (error) {
            console.error("Failed to add term to DB:", error);
            fetchHistory(true); // Revert/Refresh on failure
        }
    };

    const updateTerm = async (id: string, updates: Partial<GlossaryTerm>) => {
        // Optimistic UI update
        const newHistory = history.map((item) => (item.id === id ? { ...item, ...updates } : item));
        setHistory(newHistory);
        globalHistoryCache = newHistory;

        // DB sync
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_history', id, updates })
            });
        } catch (error) {
            console.error("Failed to update term in DB:", error);
        }
    };

    const deleteTerm = async (id: string) => {
        // Optimistic UI update
        const newHistory = history.filter((item) => item.id !== id);
        setHistory(newHistory);
        globalHistoryCache = newHistory;

        // DB sync
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_history', id })
            });
        } catch (error) {
            console.error("Failed to delete term from DB:", error);
            fetchHistory(true); // Refresh on failure
        }
    };

    return {
        history,
        loading,
        addTerm,
        updateTerm,
        deleteTerm,
        isMounted,
        refetch: (isPolling = false) => fetchHistory(true, isPolling)
    };
}
