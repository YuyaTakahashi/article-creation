export interface GlossaryTerm {
    id: string;
    topic: string;
    mail: string;
    difficulty: number;
    literacy: number;
    context: string;
    createdAt: number;
    status: "pending" | "completed" | "error";
    progress?: number;
    currentNode?: string;
    wpLink?: string;
    difyResponse?: string;
    errorMessage?: string;
    isDeleteProtected?: boolean;
}
