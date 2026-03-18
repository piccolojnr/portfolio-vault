"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { useActiveCorpus } from "@/lib/corpus";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const NODE_COLORS: Record<string, string> = {
  project: "#f59e0b",
  technology: "#3b82f6",
  organisation: "#22c55e",
  person: "#f8fafc",
  outcome: "#a855f7",
};

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
}
interface GraphLink {
  source: string | any;
  target: string | any;
  label: string;
}
interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ corpus?: string; node?: string; search?: string }>;
}) {
  const { corpus: corpusParam, node, search: searchParam } = use(searchParams);
  const { org } = useAuth();
  const { data: corpusData } = useActiveCorpus(org?.id);
  // Use active corpus key; fall back to URL ?corpus= param for deep-linking, then default
  const corpus = corpusData?.corpus?.corpus_key ?? corpusParam ?? "portfolio_vault";
  const targetNodeId = node;

  const [search, setSearch] = useState(searchParam ?? "");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [graphReady, setGraphReady] = useState(false);
  const graphRef = useRef<any>(null);
  const [graphMounted, setGraphMounted] = useState(false);
  const setGraphRef = useCallback((node: any) => {
    graphRef.current = node;
    if (node) setGraphMounted(true);
  }, []);
  const initialFocusDoneRef = useRef(false);

  // Don't fetch until we know the real corpus_key — avoids a wasted "portfolio_vault" request
  const corpusReady = !!corpusData;

  const { data: graphData, isLoading: loading } = useQuery<GraphData>({
    queryKey: ["graph", corpus],
    queryFn: () =>
      fetch(`/api/graph/${corpus}`).then((r) => {
        if (!r.ok) throw new Error(`Graph fetch failed: ${r.status}`);
        return r.json();
      }),
    staleTime: 5 * 60 * 1000,
    placeholderData: { nodes: [], links: [] },
    enabled: corpusReady,
  });

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelected(node);
      const neighbors = new Set<string>([node.id]);
      (graphData?.links ?? []).forEach((link) => {
        const src = typeof link.source === "object" ? link.source.id : link.source;
        const tgt = typeof link.target === "object" ? link.target.id : link.target;
        if (src === node.id) neighbors.add(tgt);
        if (tgt === node.id) neighbors.add(src);
      });
      setHighlightNodes(neighbors);
      
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 500);
        graphRef.current.zoom(4, 500);
      }
      
      const url = new URL(window.location.href);
      url.searchParams.set("corpus", corpus);
      url.searchParams.set("node", node.id);
      window.history.replaceState(null, "", url.toString());
    },
    [graphData?.links, corpus],
  );

  useEffect(() => {
    if (loading) return;

    // Guard: data fetched but empty
    if (!graphData?.nodes.length) {
      // Small delay for empty state to prevent flicker during transitions
      const timer = setTimeout(() => setGraphReady(true), 500);
      return () => clearTimeout(timer);
    }

    if (!graphMounted) return;

    if (targetNodeId && !initialFocusDoneRef.current) {
      const node = graphData.nodes.find(
        (n) => n.id === targetNodeId || n.label.toLowerCase() === targetNodeId.toLowerCase()
      );

      if (node) {
        initialFocusDoneRef.current = true;
        setTimeout(() => {
          handleNodeClick(node);
          setGraphReady(true);
        }, 150);
        return;
      }
    }

    if (!graphReady) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400);
        setGraphReady(true);
      }, 150);
    }
  }, [loading, graphData, targetNodeId, handleNodeClick, graphMounted, graphReady]);

  const getNodeColor = (node: GraphNode) => {
    if (search && !node.label.toLowerCase().includes(search.toLowerCase()))
      return "#1a1a1a";
    if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) return "#444";
    return NODE_COLORS[node.type] || "#6b7280";
  };

  const neighbors = selected
    ? (graphData?.links ?? []).filter((l) => {
        const src = typeof l.source === "object" ? l.source.id : l.source;
        const tgt = typeof l.target === "object" ? l.target.id : l.target;
        return src === selected.id || tgt === selected.id;
      })
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-64 text-sm bg-muted/50 border border-border rounded px-3 py-1.5 focus:outline-none focus:border-amber-400"
        />
        <span className="font-mono text-sm text-muted-foreground">
          Knowledge Graph
        </span>
      </div>
      <div className="flex flex-1 min-h-0 relative">
        <div className={`flex-1 relative transition-opacity duration-1000 ${graphReady ? 'opacity-100' : 'opacity-0'}`}>
          {graphReady && !graphData?.nodes.length && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              No graph data available for this search.
            </div>
          )}
          {!loading && !!graphData?.nodes.length && (
            <ForceGraph2D
              ref={setGraphRef as any}
              graphData={graphData}
              nodeLabel="label"
              nodeColor={getNodeColor as any}
              nodeRelSize={5}
              linkColor={() => "#374151"}
              linkLabel="label"
              onNodeClick={handleNodeClick as any}
              onBackgroundClick={() => {
                setSelected(null);
                setHighlightNodes(new Set());
                const url = new URL(window.location.href);
                url.searchParams.delete("node");
                window.history.replaceState(null, "", url.toString());
              }}
              backgroundColor="#09090b"
              warmupTicks={100}
            />
          )}
        </div>
        
        {(!graphReady || loading) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-500">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 border-4 border-amber-400/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-amber-400 rounded-full animate-spin"></div>
              <div className="absolute inset-4 border-2 border-blue-400/20 rounded-full animate-pulse"></div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-xl font-medium tracking-tight bg-linear-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
                Loading Knowledge Graph
              </h2>
              <p className="text-sm text-muted-foreground font-mono animate-pulse">
                {loading ? "Fetching nodes..." : "Simulating physics..."}
              </p>
            </div>
          </div>
        )}

        {selected && (
          <div className="w-72 border-l border-border bg-background p-4 overflow-y-auto shrink-0 z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {selected.type}
              </span>
              <h3 className="font-medium truncate">{selected.label}</h3>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">Connections:</p>
              {neighbors.map((link, i) => {
                const src = typeof link.source === "object" ? link.source.id : link.source;
                const tgt = typeof link.target === "object" ? link.target.id : link.target;
                const otherId = src === selected.id ? tgt : src;
                const otherNode = (graphData?.nodes ?? []).find(
                  (n) => n.id === otherId,
                );
                return (
                  <button
                    key={i}
                    onClick={() => otherNode && handleNodeClick(otherNode)}
                    className="w-full text-left text-xs p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">
                      {otherNode?.label || otherId}
                    </span>
                    {link.label && (
                      <span className="text-muted-foreground ml-1">
                        — {link.label.slice(0, 60)}
                      </span>
                    )}
                  </button>
                );
              })}
              {neighbors.length === 0 && (
                <p className="text-xs text-muted-foreground">No connections</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
