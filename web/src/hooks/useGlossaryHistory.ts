import { useLocalStorage } from "./useLocalStorage";
import { GlossaryTerm } from "@/types";

export function useGlossaryHistory() {
    const [history, setHistory, isMounted] = useLocalStorage<GlossaryTerm[]>(
        "ux_glossary_history",
        []
    );

    const addTerm = (term: GlossaryTerm) => {
        setHistory((prev) => [term, ...prev]);
    };

    const updateTerm = (id: string, updates: Partial<GlossaryTerm>) => {
        setHistory((prev) =>
            prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
        );
    };

    const deleteTerm = (id: string) => {
        setHistory((prev) => prev.filter((item) => item.id !== id));
    };

    return {
        history,
        addTerm,
        updateTerm,
        deleteTerm,
        isMounted,
    };
}
