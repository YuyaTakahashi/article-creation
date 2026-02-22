"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useGlossaryHistory } from "@/hooks/useGlossaryHistory";
import { GlossaryTerm } from "@/types";
import { Bot, Sparkles, Send } from "lucide-react";

export default function CreateTermPage() {
  const router = useRouter();
  const { addTerm, isMounted } = useGlossaryHistory();
  const [mail, setMail] = useLocalStorage("ux_glossary_user_mail", "");

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<number>(0.5);
  const [literacy, setLiteracy] = useState<number>(0.5);
  const [context, setContext] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;

    const newTerm: GlossaryTerm = {
      id: crypto.randomUUID(),
      topic,
      mail,
      difficulty,
      literacy,
      context,
      createdAt: Date.now(),
      status: "pending",
    };

    addTerm(newTerm);
    router.push("/history");
  };

  if (!isMounted) return null; // Hydration safe

  return (
    <div className="min-h-full p-8 md:p-12 animate-fade-in flex justify-center items-start">
      <div className="w-full max-w-3xl">


        <form onSubmit={handleSubmit} className="glass rounded-3xl p-8 md:p-10 shadow-2xl animate-slide-up" style={{ animationDelay: "200ms" }}>
          <div className="space-y-8">
            {/* Term Name (topic) */}
            <div className="space-y-3">
              <label htmlFor="topic" className="block text-sm font-semibold text-[var(--foreground)]/90 tracking-wide">
                用語名 <span className="text-red-400">*</span>
              </label>
              <input
                id="topic"
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例: デザインスプリント、クロスモーダル"
                className="w-full rounded-xl glass-input px-5 py-4 text-base placeholder:text-[var(--foreground)]/30 focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            {/* Email Address */}
            <div className="space-y-3">
              <label htmlFor="mail" className="block text-sm font-semibold text-[var(--foreground)]/90 tracking-wide">
                通知先メールアドレス
              </label>
              <input
                id="mail"
                type="email"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                placeholder="you@example.com (次回から自動入力されます)"
                className="w-full rounded-xl glass-input px-5 py-4 text-base placeholder:text-[var(--foreground)]/30 focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
              />
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Target Difficulty */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label htmlFor="difficulty" className="block text-sm font-semibold text-[var(--foreground)]/90 tracking-wide">
                    難易度 (Target Difficulty)
                  </label>
                  <span className="px-3 py-1 rounded-full text-xs font-bold glass bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    {difficulty.toFixed(1)}
                  </span>
                </div>
                <input
                  id="difficulty"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)] shadow-inner"
                />
                <div className="flex justify-between text-xs text-[var(--foreground)]/50 font-medium px-1">
                  <span>初心者</span>
                  <span>専門家</span>
                </div>
              </div>

              {/* Target IT Literacy */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label htmlFor="literacy" className="block text-sm font-semibold text-[var(--foreground)]/90 tracking-wide">
                    ITリテラシー (Target IT Literacy)
                  </label>
                  <span className="px-3 py-1 rounded-full text-xs font-bold glass bg-emerald-500/10 text-emerald-500">
                    {literacy.toFixed(1)}
                  </span>
                </div>
                <input
                  id="literacy"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={literacy}
                  onChange={(e) => setLiteracy(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 shadow-inner"
                />
                <div className="flex justify-between text-xs text-[var(--foreground)]/50 font-medium px-1">
                  <span>低</span>
                  <span>高</span>
                </div>
              </div>
            </div>

            {/* Context */}
            <div className="space-y-3">
              <label htmlFor="context" className="block text-sm font-semibold text-[var(--foreground)]/90 tracking-wide">
                コンテキスト・補足事項
              </label>
              <textarea
                id="context"
                rows={4}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="この記事で強調したいポイントや、前提知識として与えたい文脈を入力してください..."
                className="w-full rounded-xl glass-input px-5 py-4 text-base placeholder:text-[var(--foreground)]/30 focus:ring-2 focus:ring-[var(--color-primary)] transition-all resize-y"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={!topic}
                className="group relative w-full flex items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-purple-600 px-8 py-4 text-white font-bold text-lg shadow-lg shadow-purple-500/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="relative flex items-center gap-2">
                  <Bot className="w-6 h-6" />
                  生成を開始する
                  <Send className="w-5 h-5 ml-2 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
