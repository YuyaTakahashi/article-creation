"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGlossaryHistory } from "@/hooks/useGlossaryHistory";
import { GlossaryTerm } from "@/types";
import { ArrowLeft, ExternalLink, Bot, AlertTriangle, FileText, Settings, Mail } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function DetailPage() {
    const params = useParams();
    const router = useRouter();
    const { history, isMounted, loading } = useGlossaryHistory();
    const [term, setTerm] = useState<GlossaryTerm | null>(null);

    useEffect(() => {
        if (!isMounted || loading) return;

        const targetId = Array.isArray(params.id) ? params.id[0] : params.id;

        // If history is empty and we finished loading, something might be wrong with the cache
        // But if history exists, look for the term
        const found = history.find((t) => t.id === targetId);

        if (found) {
            setTerm(found);
        } else if (history.length > 0) {
            // Only redirect if history is actually loaded and the ID is definitely not there
            console.warn(`Term ${targetId} not found in history of ${history.length} items`);
            router.push("/history");
        }
    }, [history, isMounted, loading, params.id, router]);

    if (!isMounted || loading) {
        return (
            <div className="min-h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-[var(--foreground)]/50">
                    <AlertTriangle className="w-8 h-8 animate-pulse text-[var(--color-primary)] opacity-50 hidden" />
                    <p className="font-bold tracking-wide animate-pulse">データベース読込中...</p>
                </div>
            </div>
        );
    }

    if (!term) return null;

    if (!term) return null;

    return (
        <div className="min-h-full p-4 md:p-12 animate-fade-in pb-24 md:pb-12">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <Link
                        href="/history"
                        className="inline-flex items-center gap-2 text-[var(--foreground)]/60 hover:text-[var(--color-primary)] transition-colors font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        一覧へ戻る
                    </Link>

                    {term.wpLink && (
                        <a
                            href={term.wpLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all font-bold shadow-sm"
                        >
                            WordPressを開く
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                </div>

                <div className="space-y-4 md:space-y-6">
                    {/* Header Card */}
                    <div className="glass rounded-3xl p-6 md:p-8 shadow-lg shadow-black/5 animate-slide-up relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-primary)]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
                            <div>
                                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-[var(--foreground)]/5 text-[var(--foreground)]/60">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--foreground)] break-words">
                                        {term.topic}
                                    </h1>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs md:text-sm font-medium text-[var(--foreground)]/50">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <Mail className="w-4 h-4 flex-shrink-0" />
                                        <span className="truncate">{term.mail || "未設定"}</span>
                                    </span>
                                    <span className="hidden md:inline">•</span>
                                    <span>{new Date(Number(term.createdAt)).toLocaleDateString("ja-JP")}</span>
                                </div>
                            </div>

                            <div className="md:text-right">
                                <div className="text-xs text-[var(--foreground)]/50 font-medium mb-1 uppercase tracking-wider">Status</div>
                                {term.status === "pending" && (
                                    <span className="inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-500">
                                        生成中...
                                    </span>
                                )}
                                {term.status === "completed" && (
                                    <span className="inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500">
                                        完了
                                    </span>
                                )}
                                {term.status === "error" && (
                                    <span className="inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-full bg-red-500/10 text-red-500">
                                        エラー
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Parameters Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
                        <div className="glass rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 text-[var(--foreground)]/60 font-semibold text-sm">
                                <Settings className="w-4 h-4" />
                                難易度設定 (Difficulty)
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-3xl font-bold">{term.difficulty.toFixed(1)}</span>
                                </div>
                                <div className="h-2 w-full bg-[var(--foreground)]/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-blue-500 rounded-full"
                                        style={{ width: `${term.difficulty * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="glass rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 text-[var(--foreground)]/60 font-semibold text-sm">
                                <Settings className="w-4 h-4" />
                                ITリテラシー設定 (Literacy)
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-3xl font-bold">{term.literacy.toFixed(1)}</span>
                                </div>
                                <div className="h-2 w-full bg-[var(--foreground)]/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                                        style={{ width: `${term.literacy * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Context Card */}
                    {term.context && (
                        <div className="glass rounded-3xl p-6 md:p-8 shadow-sm animate-slide-up" style={{ animationDelay: "150ms" }}>
                            <div className="flex items-center gap-2 mb-4 text-[var(--foreground)]/80 font-bold">
                                <FileText className="w-5 h-5 text-[var(--color-primary)]" />
                                入力したコンテキスト
                            </div>
                            <div className="bg-[var(--foreground)]/5 rounded-2xl p-5 text-[var(--foreground)]/80 leading-relaxed whitespace-pre-wrap">
                                {term.context}
                            </div>
                        </div>
                    )}

                    {/* AI Response Output */}
                    <div className="glass rounded-3xl p-6 md:p-8 shadow-sm animate-slide-up border border-[var(--color-primary)]/20" style={{ animationDelay: "200ms" }}>
                        <div className="flex items-center gap-2 mb-4 md:mb-6 text-[var(--foreground)] font-bold text-base md:text-lg">
                            <Bot className="w-6 h-6 text-[var(--color-primary)]" />
                            Dify (AI) の返答内容
                        </div>

                        {term.status === "pending" ? (
                            <div className="flex flex-col py-8">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-8 h-8 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin flex-shrink-0" />
                                    <div>
                                        <p className="text-[var(--foreground)] font-bold">AI処理を実行中...</p>
                                        <p className="text-sm text-[var(--color-primary)] animate-pulse mt-1">
                                            {term.currentNode ? `${term.currentNode} を処理しています` : "準備中..."}
                                        </p>
                                    </div>
                                </div>

                                {term.difyResponse && (
                                    <div className="bg-white dark:bg-[#1a1b26] text-[var(--foreground)] rounded-2xl p-6 md:p-8 shadow-inner relative transition-opacity border border-slate-200 dark:border-slate-800">
                                        <div className="absolute top-3 right-4 flex gap-1.5 opacity-50">
                                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </div>
                                        <div className="prose prose-slate dark:prose-invert max-w-none break-words mt-2">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {term.difyResponse}
                                            </ReactMarkdown>
                                            <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : term.status === "error" ? (
                            <div className="bg-red-500/10 p-6 rounded-2xl flex items-start gap-4 text-red-600 dark:text-red-400">
                                <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-bold mb-1">エラーが発生しました</h3>
                                    <p className="text-sm opacity-90">{term.errorMessage}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-[#1a1b26] text-[var(--foreground)] rounded-2xl p-6 md:p-8 shadow-inner border border-slate-200 dark:border-slate-800">
                                <div className="prose prose-slate dark:prose-invert max-w-none break-words">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {term.difyResponse || ""}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
