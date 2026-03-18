"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { useActiveCorpus, useOrgCorpora, useSetActiveCorpus } from "@/lib/corpus";
import { Button } from "@/components/ui/button";

interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

// Extract the backend `detail` message from an apiFetch error string.
// apiFetch throws: "Error: STATUS: JSON_BODY" where JSON_BODY may have {detail: "..."}
function apiDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\d{3}: (.+)$/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.detail) return String(parsed.detail);
    } catch {}
  }
  return msg;
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
  );
}

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2.5">
      <label className="w-40 shrink-0 text-[12px] font-mono text-muted-foreground">
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/50 font-mono sm:w-32 sm:text-right shrink-0">
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const { org, refresh: refreshAuth } = useAuth();

  const [orgName, setOrgName] = useState(org?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [pendingInvites, setPendingInvites] = useState<{id: string; email: string; role: string; expires_at: string}[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState("");
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [transferError, setTransferError] = useState("");

  // Hooks must be called unconditionally
  const { data: activeCorpusData } = useActiveCorpus(org?.id);
  const { data: corporaData } = useOrgCorpora(org?.id);
  const setActiveCorpusMut = useSetActiveCorpus(org?.id ?? "");

  const loadInvites = (orgId: string) => {
    setInvitesLoading(true);
    apiFetch<{id: string; email: string; role: string; expires_at: string}[]>(`/api/orgs/${orgId}/invites`)
      .then(setPendingInvites)
      .catch(() => setPendingInvites([]))
      .finally(() => setInvitesLoading(false));
  };

  useEffect(() => {
    if (!org) return;
    setOrgName(org.name);
    setMembersLoading(true);
    apiFetch<Member[]>(`/api/orgs/${org.id}/members`)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setMembersLoading(false));
    loadInvites(org.id);
  }, [org]);

  const saveOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setNameError("");
    setNameSaving(true);
    setNameSaved(false);
    try {
      await apiFetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      await refreshAuth();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (err) {
      setNameError(apiDetail(err));
    } finally {
      setNameSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!org) return;
    try {
      await apiFetch(`/api/orgs/${org.id}/members/${userId}`, { method: "DELETE" });
      setMembers((m) => m.filter((x) => x.user_id !== userId));
    } catch (err) {
      alert(apiDetail(err));
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
      alert(apiDetail(err));
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
      loadInvites(org.id);
    } catch (err) {
      setInviteError(apiDetail(err));
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
      setTransferError(apiDetail(err));
    }
  };

  // Loading state
  if (!org) {
    return (
      <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const revokeInvite = async (inviteId: string) => {
    if (!org) return;
    setRevoking(inviteId);
    try {
      await apiFetch(`/api/orgs/${org.id}/invites/${inviteId}`, { method: "DELETE" });
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      alert(apiDetail(err));
    } finally {
      setRevoking(null);
    }
  };

  const isOwner = org.role === "owner";
  const canManage = isOwner || org.role === "admin";
  const corpora = corporaData?.corpora ?? [];

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Organisation
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Manage your organisation name, knowledge base, and team.
            </p>
          </div>

          {/* General */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>General</SectionHeading>
            <form onSubmit={saveOrgName}>
              <FieldRow label="Name">
                <div className="flex items-center gap-2">
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!isOwner}
                    className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                  />
                  {isOwner && (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={nameSaving}
                      className="h-7 px-3 text-[11px] font-mono"
                    >
                      {nameSaving ? "…" : "save"}
                    </Button>
                  )}
                  {nameSaved && (
                    <span className="text-[11px] font-mono text-green-400">Saved</span>
                  )}
                </div>
                {nameError && (
                  <p className="mt-1 text-[11px] text-destructive font-mono">{nameError}</p>
                )}
              </FieldRow>
            </form>
          </section>

          {/* Knowledge Base */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Knowledge Base</SectionHeading>
            <p className="text-[11px] font-mono text-muted-foreground/60 mb-3">
              All conversations in this organisation search the active knowledge base.
            </p>
            {!activeCorpusData?.corpus && (
              <div className="mb-4 text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                No knowledge base selected — chat will not work until you select one.
              </div>
            )}
            <FieldRow label="Active corpus">
              <select
                value={activeCorpusData?.corpus?.id ?? ""}
                onChange={(e) => {
                  if (e.target.value) setActiveCorpusMut.mutate(e.target.value);
                }}
                disabled={!canManage}
                className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50 appearance-none cursor-pointer"
              >
                <option value="">— select knowledge base —</option>
                {corpora.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FieldRow>
          </section>

          {/* Team Members */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Team Members</SectionHeading>
            {membersLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/20" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="text-[12px] font-mono text-muted-foreground/50">No members found.</p>
            ) : (
              <div className="divide-y divide-border/30">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between py-2.5 gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-mono text-foreground truncate">{m.email}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/50">
                        joined {new Date(m.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner && m.role !== "owner" ? (
                        <select
                          value={m.role}
                          onChange={(e) => updateRole(m.user_id, e.target.value)}
                          className="bg-surface border border-border rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className="text-[11px] font-mono text-muted-foreground/60">
                          {m.role}
                        </span>
                      )}
                      {isOwner && m.role !== "owner" && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          className="text-[11px] font-mono text-muted-foreground/40 hover:text-destructive transition-colors"
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

          {/* Pending Invites */}
          {canManage && (
            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <SectionHeading>Pending Invites</SectionHeading>
              {invitesLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/20" />
                  ))}
                </div>
              ) : pendingInvites.length === 0 ? (
                <p className="text-[12px] font-mono text-muted-foreground/50">No pending invites.</p>
              ) : (
                <div className="divide-y divide-border/30">
                  {pendingInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2.5 gap-4">
                      <div className="min-w-0">
                        <div className="text-[12px] font-mono text-foreground truncate">{inv.email}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/50">
                          {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        disabled={revoking === inv.id}
                        className="text-[11px] font-mono text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        {revoking === inv.id ? "…" : "revoke"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Invite */}
          {canManage && (
            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <SectionHeading>Invite someone to {org.name}</SectionHeading>
              <form onSubmit={sendInvite}>
                <FieldRow label="Email">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 min-w-0 basis-full sm:basis-auto bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="bg-surface border border-border rounded-md px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={inviteSending}
                      className="h-7 px-3 text-[11px] font-mono"
                    >
                      {inviteSending ? "…" : "invite"}
                    </Button>
                  </div>
                </FieldRow>
                {inviteError && (
                  <p className="mt-1 text-[11px] text-destructive font-mono">{inviteError}</p>
                )}
                {inviteSuccess && (
                  <p className="mt-1 text-[11px] text-green-400 font-mono">{inviteSuccess}</p>
                )}
              </form>
            </section>
          )}

          {/* Danger zone — transfer ownership */}
          {isOwner && (
            <section className="rounded-xl border border-destructive/30 bg-surface/40 p-5">
              <SectionHeading>Danger Zone</SectionHeading>
              {!transferConfirm ? (
                <FieldRow label="Transfer ownership">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferConfirm(true)}
                    className="h-7 px-3 text-[11px] font-mono border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    transfer ownership…
                  </Button>
                </FieldRow>
              ) : (
                <div className="space-y-3">
                  <p className="text-[12px] font-mono text-destructive">
                    This cannot be undone. Select the new owner:
                  </p>
                  <select
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
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
                    <p className="text-[11px] text-destructive font-mono">{transferError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!transferTarget}
                      onClick={transferOwnership}
                      className="h-7 px-3 text-[11px] font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      confirm transfer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTransferConfirm(false);
                        setTransferError("");
                      }}
                      className="h-7 px-2 text-[11px] font-mono"
                    >
                      cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
