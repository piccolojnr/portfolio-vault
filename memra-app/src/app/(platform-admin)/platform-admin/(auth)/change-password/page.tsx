"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/platform-admin/api";

export default function PlatformAdminChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    setLoading(true);

    try {
      await adminFetch("/api/platform/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Change password failed";
      const detailMatch = msg.match(/^\d+:\s*(\{.*\})$/);
      if (detailMatch) {
        try {
          const parsed = JSON.parse(detailMatch[1]);
          setError(parsed.detail || msg);
        } catch {
          setError(msg);
        }
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="w-full max-w-sm rounded border border-neutral-800 bg-[#141414] p-6">
        <h1 className="mb-6 text-lg font-medium text-neutral-200">
          Change Password
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="current"
              className="mb-1 block text-xs text-neutral-500"
            >
              Current password
            </label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="new"
              className="mb-1 block text-xs text-neutral-500"
            >
              New password
            </label>
            <input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="mb-1 block text-xs text-neutral-500"
            >
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
