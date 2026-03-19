import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/network/api";

export interface CorpusRead {
  id: string;
  name: string;
  corpus_key: string;
  created_at: string;
}

export function useActiveCorpus(orgId: string | undefined) {
  return useQuery({
    queryKey: ["active-corpus", orgId],
    queryFn: () =>
      apiFetch<{ corpus: CorpusRead | null }>(`/api/orgs/${orgId}/active-corpus`),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetActiveCorpus(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpusId: string) =>
      apiFetch(`/api/orgs/${orgId}/active-corpus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpus_id: corpusId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-corpus", orgId] });
    },
  });
}

export function useOrgCorpora(orgId: string | undefined) {
  return useQuery({
    queryKey: ["corpora", orgId],
    queryFn: () =>
      apiFetch<CorpusRead[]>(`/api/orgs/${orgId}/corpora`),
    enabled: !!orgId,
  });
}
