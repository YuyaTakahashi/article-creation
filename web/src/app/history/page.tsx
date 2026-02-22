"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGlossaryHistory } from "@/hooks/useGlossaryHistory";
import { Loader2, CheckCircle2, XCircle, ArrowRight, ExternalLink, Trash2, Lock } from "lucide-react";

export default function HistoryPage() {
    const { history, updateTerm, deleteTerm, isMounted } = useGlossaryHistory();
    const processingRef = useRef<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Background worker to process pending terms
    useEffect(() => {
        if (!isMounted) return;

        const processPendingTasks = async () => {
            const pendingTasks = history.filter((t) => t.status === "pending");

            for (const task of pendingTasks) {
                if (processingRef.current.has(task.id)) continue;

                processingRef.current.add(task.id);

                try {
                    const res = await fetch("/api/dify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            topic: task.topic,
                            mail: task.mail,
                            difficulty: task.difficulty,
                            literacy: task.literacy,
                            context: task.context,
                        }),
                    });

                    if (!res.ok) {
                        throw new Error(`Server responded with ${res.status}`);
                    }
                    if (!res.body) {
                        throw new Error("No response body streamed from server");
                    }

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let fullAnswer = "";
                    let buffer = "";

                    // Define expected total nodes for progress calculation
                    const TOTAL_EXPECTED_NODES = 25;
                    let completedNodesCount = 0;

                    // Process the Streaming chunks
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");

                        // Keep incomplete chunk in the buffer for the next iteration
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                try {
                                    const dataStr = line.slice(6).trim();
                                    if (!dataStr) continue;

                                    const data = JSON.parse(dataStr);

                                    // Handle Dify Events
                                    if (data.event === "node_started") {
                                        // Update current workflow node (e.g., "Information Gathering", "Article Writing")
                                        updateTerm(task.id, { currentNode: data.data.title });
                                    } else if (data.event === "node_finished") {
                                        completedNodesCount++;
                                        const calculatedProgress = Math.min(Math.round((completedNodesCount / TOTAL_EXPECTED_NODES) * 100), 99);
                                        updateTerm(task.id, {
                                            currentNode: `完了: ${data.data.title}`,
                                            completedNodes: completedNodesCount,
                                            progress: calculatedProgress
                                        });
                                    } else if (data.event === "message" || data.event === "agent_message" || data.event === "text_chunk") {
                                        if (data.answer) {
                                            fullAnswer += data.answer;
                                        }
                                    } else if (data.event === "workflow_finished" || data.event === "message_end") {
                                        // Finished completely
                                    }
                                } catch (e) {
                                    // Ignore JSON parse errors for incomplete event chunks
                                }
                            }
                        }
                    }

                    // Generate final WP Link if present in the accumulated answer
                    let wpLink = undefined;
                    // Specifically target the WordPress domain and ensure we capture the whole edit URL, avoiding trailing punctuation
                    const urlMatch = fullAnswer.match(/https?:\/\/uxdaystokyo\.com\/articles\/wp-admin\/post\.php\?[^\s)\]">]+/);
                    if (urlMatch) {
                        wpLink = urlMatch[0];
                    }

                    updateTerm(task.id, {
                        status: "completed",
                        difyResponse: fullAnswer,
                        wpLink: wpLink,
                        currentNode: "すべての処理が完了しました",
                        progress: 100,
                    });

                } catch (error) {
                    updateTerm(task.id, {
                        status: "error",
                        errorMessage: error instanceof Error ? error.message : "Unknown error",
                    });
                } finally {
                    processingRef.current.delete(task.id);
                }
            }
        };

        processPendingTasks();
    }, [history, isMounted, updateTerm]);

    const handleDelete = async (id: string, wpLink?: string, difyResponse?: string) => {
        if (!confirm("この履歴を削除しますか？紐づくWordPressの下書きやDocも削除されます。")) return;

        setIsDeleting(id);
        let shouldDeleteLocal = true;

        try {
            // Docs link could be extracted from difyResponse if it exists
            let docUrl = undefined;
            if (difyResponse) {
                // Match either the standard /document/d/ URL or the /open?id= URL
                const docMatch = difyResponse.match(/https:\/\/docs\.google\.com\/(?:document\/d\/|open\?id=)[a-zA-Z0-9_-]+/);
                if (docMatch) docUrl = docMatch[0];
            }

            // Attempt to delete remote resources if URLs are present
            if (wpLink || docUrl) {
                const res = await fetch("/api/gas/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wpLink, docUrl })
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

    if (!isMounted) return null;

    return (
        <div className="min-h-full p-8 md:p-12 animate-fade-in">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-extrabold tracking-tight mb-8 text-[var(--foreground)]">
                    作成履歴
                </h1>

                {history.length === 0 ? (
                    <div className="glass rounded-3xl p-12 text-center text-[var(--foreground)]/50">
                        <p>まだ履歴がありません。新しい用語を作成してください。</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map((item, idx) => (
                            <div
                                key={item.id}
                                className={`glass group rounded-2xl p-5 hover:bg-white/10 dark:hover:bg-black/10 transition-all animate-slide-up relative overflow-hidden flex flex-col gap-3 ${isDeleting === item.id ? 'opacity-50 pointer-events-none' : ''}`}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                <div className="flex items-center justify-between gap-4 z-10">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className="text-lg font-bold text-[var(--foreground)] truncate">
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
                                        <div className="flex items-center gap-3 text-xs text-[var(--foreground)]/50">
                                            <span>作成日: {new Date(item.createdAt).toLocaleString("ja-JP")}</span>
                                            {item.status === "pending" && item.currentNode && (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-2 text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full animate-pulse">
                                                        <span>{item.currentNode} を実行中...</span>
                                                        {item.progress !== undefined && (
                                                            <span className="bg-white/50 dark:bg-black/20 text-[var(--color-primary)] px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                                                                {item.progress}%
                                                            </span>
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {item.wpLink && (
                                            <a
                                                href={item.wpLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all font-bold text-sm shadow-sm"
                                            >
                                                WordPressで開く
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                        <Link
                                            href={`/detail/${item.id}`}
                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] transition-all font-bold text-sm"
                                        >
                                            詳細
                                            <ArrowRight className="w-4 h-4" />
                                        </Link>
                                        {item.isDeleteProtected ? (
                                            <div
                                                className="p-2 ml-2 rounded-xl bg-[var(--foreground)]/10 text-[var(--foreground)]/50 cursor-not-allowed tooltip"
                                                title="公開済みの記事のため削除できません"
                                            >
                                                <Lock className="w-5 h-5" />
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleDelete(item.id, item.wpLink, item.difyResponse)}
                                                disabled={isDeleting === item.id}
                                                className={`p-2 ml-2 rounded-xl flex items-center gap-2 transition-colors ${isDeleting === item.id ? 'bg-red-500/20 text-red-500 cursor-wait' : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'}`}
                                                title="削除する"
                                            >
                                                {isDeleting === item.id ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        <span className="text-sm font-bold">削除中...</span>
                                                    </>
                                                ) : (
                                                    <Trash2 className="w-5 h-5" />
                                                )}
                                            </button>
                                        )}
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
