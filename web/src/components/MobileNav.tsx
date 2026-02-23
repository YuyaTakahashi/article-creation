"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, History } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-[rgba(255,255,255,0.1)] px-4 pb-safe">
            <nav className="flex items-center justify-around h-16">
                {routes.map((route) => (
                    <Link
                        key={route.href}
                        href={route.href}
                        className={cn(
                            "flex flex-col items-center justify-center space-y-1 w-full h-full transition-all duration-200",
                            route.active
                                ? "text-[var(--color-primary)] bg-[var(--color-primary)]/5"
                                : "text-[var(--foreground)]/50"
                        )}
                    >
                        <route.icon
                            className={cn(
                                "h-5 w-5",
                                route.active ? "text-[var(--color-primary)]" : "text-[var(--foreground)]/40"
                            )}
                        />
                        <span className="text-[10px] font-bold tracking-tighter uppercase">{route.label}</span>
                        {route.active && (
                            <div className="absolute top-0 w-12 h-1 bg-[var(--color-primary)] rounded-full translate-y-[-1px]" />
                        )}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
