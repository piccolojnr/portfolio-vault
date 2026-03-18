"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";

interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

export default function OrgSettingsPage() {
  const { org, refresh: refreshAuth } = useAuth();

  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [transferTarget, setTransferTarget] = useState("");
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    if (!org) return;
    setOrgName(org.name);
    setMembersLoading(true);
    apiFetch<Member[]>(`/api/orgs/${org.id}/members`)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [org]);

  const saveOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setNameError("");
    setNameSaving(true);
    try {
      await apiFetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      await refreshAuth();
    } catch (err) {
      setNameError(String(err));
    } finally {
      setNameSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!org) return;
    try {
      await apiFetch(`/api/orgs/${org.id}/members/${userId}`, {
        method: "DELETE",
      });
      setMembers((m) => m.filter((x) => x.user_id !== userId));
    } catch (err) {
      alert(String(err));
    }
  };

  const updateRole = async (userId: string, role: string) => {
    if (!org) return;
    try {
      const updated = await apiFetch<Member>(
        `/api/orgs/${org.id}/members/${userId}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      setMembers((m) => m.map((x) => (x.user_id === userId ? updated : x)));
    } catch (err) {
      alert(String(err));
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setInviteError("");
    setInviteSuccess("");
    setInviteSending(true);
    try {
      await apiFetch(`/api/orgs/${org.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
    } catch (err) {
      setInviteError(String(err));
    } finally {
      setInviteSending(false);
    }
  };

  const transferOwnership = async () => {
    if (!org || !transferTarget) return;
    setTransferError("");
    try {
      await apiFetch(`/api/orgs/${org.id}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_owner_user_id: transferTarget }),
      });
      await refreshAuth();
      setTransferConfirm(false);
    } catch (err) {
      setTransferError(String(err));
    }
  };

  if (!org) {
    return (
      <div className="p-8 text-sm text-muted-foreground font-mono">
        Loading organisation…
      </div>
    );
  }

  const isOwner = org.role === "owner";

  return (
    <div className=" mx-auto py-8 space-y-10">
      <h1 className="text-xl font-mono font-semibold">organisation settings</h1>

      {/* Org name */}
      <section className="space-y-3">
        <h2 className="text-sm font-mono font-medium">name</h2>
        <form onSubmit={saveOrgName} className="flex gap-2">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            disabled={!isOwner}
            className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          {isOwner && (
            <button
              type="submit"
              disabled={nameSaving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {nameSaving ? "…" : "save"}
            </button>
          )}
        </form>
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </section>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-sm font-mono font-medium">members</h2>
        {membersLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border border-border divide-y divide-border">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-sm font-mono">{m.email}</div>
                  <div className="text-xs text-muted-foreground">
                    joined {new Date(m.joined_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      onChange={(e) => updateRole(m.user_id, e.target.value)}
                      className="text-xs font-mono border border-border rounded px-2 py-1 bg-background"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground">
                      {m.role}
                    </span>
                  )}
                  {isOwner && m.role !== "owner" && (
                    <button
                      onClick={() => removeMember(m.user_id)}
                      className="text-xs text-destructive hover:underline font-mono"
                    >
                      remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Invite */}
      {(isOwner || org.role === "admin") && (
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium">invite member</h2>
          <form onSubmit={sendInvite} className="flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="text-xs font-mono border border-border rounded px-2 py-1 bg-background"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={inviteSending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {inviteSending ? "…" : "invite"}
            </button>
          </form>
          {inviteError && (
            <p className="text-xs text-destructive">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="text-xs text-green-500">{inviteSuccess}</p>
          )}
        </section>
      )}

      {/* Transfer ownership */}
      {isOwner && (
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-destructive">
            transfer ownership
          </h2>
          {!transferConfirm ? (
            <button
              onClick={() => setTransferConfirm(true)}
              className="px-4 py-2 rounded-md border border-destructive text-destructive text-sm font-mono hover:bg-destructive/10 transition-colors"
            >
              transfer ownership…
            </button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive p-4">
              <p className="text-sm text-destructive font-mono">
                This cannot be undone. Select the new owner:
              </p>
              <select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                className="w-full text-sm font-mono border border-border rounded px-2 py-1 bg-background"
              >
                <option value="">select member…</option>
                {members
                  .filter((m) => m.role !== "owner")
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email} ({m.role})
                    </option>
                  ))}
              </select>
              {transferError && (
                <p className="text-xs text-destructive">{transferError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={transferOwnership}
                  disabled={!transferTarget}
                  className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-mono hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  confirm transfer
                </button>
                <button
                  onClick={() => {
                    setTransferConfirm(false);
                    setTransferError("");
                  }}
                  className="px-4 py-2 rounded-md border border-border text-sm font-mono hover:bg-surface transition-colors"
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
