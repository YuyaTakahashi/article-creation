import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UX Glossary Builder | Dify App",
  description: "Create premium UX Glossary terms using Dify workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="flex flex-col md:flex-row h-screen overflow-hidden text-[var(--foreground)]">
          {/* Sidebar Area - Desktop only */}
          <div className="hidden md:flex z-10 bg-[var(--background)]/50">
            <Sidebar />
          </div>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto relative z-0 pb-20 md:pb-0">
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[rgba(255,255,255,0.02)] to-[rgba(255,255,255,0.05)] pointer-events-none" />
            {children}
          </main>

          {/* Mobile Navigation - Only visible on small screens */}
          <MobileNav />
        </div>
      </body>
    </html>
  );
}
