"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const USE_CASES = [
  {
    id: "personal",
    label: "Personal knowledge base",
    description: "Store and search your own notes, research, and documents",
  },
  {
    id: "team",
    label: "Team knowledge base",
    description: "Share knowledge and documentation with your team",
  },
  {
    id: "support",
    label: "Customer support bot",
    description: "Answer customer questions from your knowledge base",
  },
  {
    id: "research",
    label: "Research and analysis",
    description: "Analyse documents, extract insights, generate reports",
  },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = async (id: string) => {
    setSelected(id);
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_case: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Failed to save preference");
        return;
      }
      router.push("/");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-mono font-semibold">
            how will you use this?
          </h1>
          <p className="text-sm text-muted-foreground">
            This helps us tailor the experience for you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {USE_CASES.map((uc) => (
            <button
              key={uc.id}
              onClick={() => handleSelect(uc.id)}
              disabled={loading}
              className={`text-left p-4 rounded-md border transition-colors ${
                selected === uc.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-surface"
              } disabled:opacity-50`}
            >
              <div className="font-mono text-sm font-medium">{uc.label}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {uc.description}
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
