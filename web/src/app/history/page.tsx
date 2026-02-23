"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useGlossaryHistory } from "@/hooks/useGlossaryHistory";
import { Loader2, AlertTriangle, FileText, ArrowRight, Trash2, MoreVertical, ExternalLink, Lock, XCircle, CheckCircle2 } from "lucide-react";

export default function HistoryPage() {
    const { history, updateTerm, deleteTerm, isMounted, loading, refetch } = useGlossaryHistory();
    const router = useRouter();
    const [mail] = useLocalStorage("ux_glossary_user_mail", "");
    const menuRef = useRef<HTMLDivElement>(null);

    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    // Poll for updates every 10 seconds if there are pending tasks
    useEffect(() => {
        if (!isMounted) return;
        const hasPending = history.some(t => t.status === "pending");
        if (!hasPending) return;

        const intervalId = setInterval(() => {
            refetch(true); // Pass true to indicate silent polling
        }, 10000);

        return () => clearInterval(intervalId);
    }, [isMounted, history, refetch]);

    // Handle click away for dropdown menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (target.closest('.menu-toggle-btn')) return;
            if (menuRef.current && !menuRef.current.contains(target)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDelete = async (id: string, wpLink?: string, difyResponse?: string) => {
        if (!confirm("この履歴を削除しますか？紐づくWordPressの下書きやDocも削除されます。")) return;

        setIsDeleting(id);
        setActiveMenu(null);
        let shouldDeleteLocal = true;

        try {
            // Docs links could be extracted from difyResponse if it exists
            let docUrls: string[] = [];
            if (difyResponse) {
                // Match all standard /document/d/ URLs or /open?id= URLs
                const docMatches = difyResponse.match(/https:\/\/docs\.google\.com\/(?:document\/d\/|open\?id=)[a-zA-Z0-9_-]+/g);
                if (docMatches) {
                    // Unique URLs only
                    docUrls = Array.from(new Set(docMatches));
                }
            }

            // Attempt to delete remote resources if URLs are present
            if (wpLink || docUrls.length > 0) {
                const res = await fetch("/api/gas/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wpLink, docUrl: docUrls })
                });

                if (res.ok) {
                    const data = await res.json();

                    // Check if GAS blocked the deletion because it's no longer a draft
                    if (data.errors && data.errors.some((err: string) => err.includes("not a draft"))) {
                        alert("このWordPress記事はすでに公開されているため、削除できませんでした。履歴は保護されます。");
                        updateTerm(id, { isDeleteProtected: true });
                        shouldDeleteLocal = false; // Prevent local deletion
                    } else if (data.errors && data.errors.length > 0) {
                        console.warn("Some remote resources could not be deleted:", data.errors);
                        // We still proceed to delete locally if it was just a generic error (e.g., already deleted)
                    }
                } else {
                    const errorData = await res.json().catch(() => ({}));
                    console.error("Server API returned an error:", errorData);
                    alert(`サーバーエラーにより削除を中止しました。設定等を確認してください。`);
                    shouldDeleteLocal = false;
                }
            }
        } catch (e) {
            console.error("Failed to delete remote resources", e);
            alert("通信エラーが発生し、削除できませんでした。");
            shouldDeleteLocal = false;
        } finally {
            // Remove from local history UI if not protected
            if (shouldDeleteLocal) {
                deleteTerm(id);
            }
            setIsDeleting(null);
        }
    };

    const handleCancel = (id: string) => {
        if (!confirm("作成処理を中止し、この履歴を削除しますか？")) return;

        // Note: Actual Dify server-side process might still continue, 
        // but we delete the tracking from our DB immediately.

        // Delete the item completely from local state
        deleteTerm(id);
        setActiveMenu(null);
    };

    if (!isMounted) return null;

    return (
        <div className="min-h-full p-4 md:p-12 animate-fade-in pb-24 md:pb-12">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-6 md:mb-8 text-[var(--foreground)]">
                    作成履歴
                </h1>

                {loading ? (
                    <div className="glass rounded-3xl p-12 text-center text-[var(--foreground)]/50 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)] opacity-80" />
                        <p className="font-bold tracking-wide">データベースから履歴を取得中...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="glass rounded-3xl p-12 text-center text-[var(--foreground)]/50">
                        <p>まだ履歴がありません。新しい用語を作成してください。</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map((item, idx) => (
                            <div
                                key={item.id}
                                onClick={(e) => {
                                    // Prevent jumping if we clicked a button inside
                                    if (item.status !== "pending" && isDeleting !== item.id) {
                                        router.push(`/detail/${item.id}`);
                                    }
                                }}
                                className={`glass group rounded-2xl p-5 transition-all duration-300 relative flex flex-col gap-3 
                                    ${item.status === "pending" ? 'animate-[pulse_3s_cubic-bezier(0.4,0,0.6,1)_infinite] bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20' : 'animate-slide-up'}
                                    ${isDeleting === item.id ? 'opacity-50 pointer-events-none' : ''} 
                                    ${item.status !== "pending"
                                        ? 'cursor-pointer hover:border-[var(--color-primary)]/50 hover:shadow-lg hover:-translate-y-0.5'
                                        : 'cursor-default'}`}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 z-10">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                                            <h2 className="text-base md:text-lg font-bold text-[var(--foreground)] truncate max-w-[200px] md:max-w-none">
                                                {item.topic}
                                            </h2>
                                            {item.status === "pending" && (
                                                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    生成中...
                                                </span>
                                            )}
                                            {item.status === "completed" && (
                                                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    完了
                                                </span>
                                            )}
                                            {item.status === "error" && (
                                                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-500">
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    エラー
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] md:text-xs text-[var(--foreground)]/50">
                                            <span>{new Date(Number(item.createdAt)).toLocaleDateString("ja-JP")}</span>
                                            {item.mail && (
                                                <>
                                                    <span className="hidden md:inline">•</span>
                                                    <span>{item.mail}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 md:gap-3 mt-2 md:mt-0">
                                        {item.wpLink && (
                                            <a
                                                href={item.wpLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all font-bold text-sm shadow-sm"
                                            >
                                                WordPressで開く
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                        <div className="relative ml-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveMenu(activeMenu === item.id ? null : item.id);
                                                }}
                                                className="menu-toggle-btn p-2 rounded-xl text-[var(--foreground)]/50 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                            >
                                                <MoreVertical className="w-5 h-5" />
                                            </button>

                                            {activeMenu === item.id && (
                                                <div
                                                    ref={menuRef}
                                                    className="absolute right-0 top-full mt-2 w-48 rounded-xl glass shadow-xl border border-[var(--foreground)]/10 overflow-hidden z-50 animate-fade-in origin-top-right"
                                                >
                                                    {item.status === "pending" ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveMenu(null);
                                                                // Call handleCancel and pass the ID
                                                                handleCancel(item.id);
                                                            }}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-amber-500 hover:bg-amber-500/10 transition-colors text-left font-medium"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                            <span>処理をキャンセル</span>
                                                        </button>
                                                    ) : item.isDeleteProtected ? (
                                                        <div className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--foreground)]/50 cursor-not-allowed">
                                                            <Lock className="w-4 h-4" />
                                                            <span>削除不可 (公開済)</span>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveMenu(null);
                                                                handleDelete(item.id, item.wpLink, item.difyResponse);
                                                            }}
                                                            disabled={isDeleting === item.id}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors text-left font-medium disabled:opacity-50 disabled:cursor-wait"
                                                        >
                                                            {isDeleting === item.id ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    <span>削除中...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Trash2 className="w-4 h-4" />
                                                                    <span>この履歴を削除</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Processing Progress Bar visualization */}
                                {item.status === "pending" && (
                                    <div className="absolute bottom-0 left-0 w-full h-[4px] bg-[var(--color-primary)]/10 overflow-hidden group-hover:h-[6px] transition-all">
                                        <div
                                            className="h-full bg-gradient-to-r from-[var(--color-primary)]/60 to-[var(--color-primary)] transition-all duration-500 ease-out relative"
                                            style={{ width: `${item.progress || 5}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
