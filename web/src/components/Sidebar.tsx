"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, History, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
    const pathname = usePathname();

    const routes = [
        {
            label: "用語を作成",
            icon: PenTool,
            href: "/",
            active: pathname === "/",
        },
        {
            label: "作成履歴",
            icon: History,
            href: "/history",
            active: pathname === "/history",
        },
    ];

    return (
        <div className="flex h-full w-64 flex-col glass border-r">
            <div className="flex h-16 items-center px-6 border-b border-[rgba(255,255,255,0.1)]">
                <Link href="/" className="flex items-center gap-2">
                    <div className="bg-gradient-to-br from-sky-400 to-blue-600 rounded-lg p-1.5 shadow-lg shadow-blue-500/20">
                        <BookOpen className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-bold text-lg tracking-tight bg-gradient-to-b from-[var(--foreground)] to-[var(--foreground)]/70 bg-clip-text text-transparent">
                        UX Glossary
                    </span>
                </Link>
            </div>

            <nav className="flex-1 space-y-2 p-4">
                {routes.map((route) => (
                    <Link
                        key={route.href}
                        href={route.href}
                        className={cn(
                            "group flex items-center space-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            route.active
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-sm backdrop-blur-md"
                                : "text-[var(--foreground)]/70 hover:bg-[var(--color-primary)]/5 hover:text-[var(--foreground)]"
                        )}
                    >
                        <route.icon
                            className={cn(
                                "h-5 w-5 transition-colors",
                                route.active ? "text-[var(--color-primary)]" : "text-[var(--foreground)]/50 group-hover:text-[var(--color-primary)]/70"
                            )}
                        />
                        <span>{route.label}</span>
                    </Link>
                ))}
            </nav>

            <div className="p-6">
                <div className="rounded-xl glass bg-white/5 p-4 text-xs text-[var(--foreground)]/60">
                    <p className="font-medium text-[var(--foreground)] mb-1">Dify Agent</p>
                    <p>Powered by Next.js & Dify Workflow API</p>
                </div>
            </div>
        </div>
    );
}
