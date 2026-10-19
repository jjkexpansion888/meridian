export type AssetType = "equity" | "crypto" | "private";
export type Source = { url: string; title: string; cited: boolean; accessedAt: string; imported?: boolean };
export type Chapter = { id: string; title: string; brief: string; status: "pending" | "running" | "completed" | "failed"; body: string; sources: Source[]; responseId?: string; wordCount?: number; error?: string; startedAt?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number }; };
export type Report = { id: string; name: string; symbol: string; type: AssetType; focus: string; context: string; depth: "deep" | "exhaustive"; createdAt: string; updatedAt: string; asOf: string; status: "draft" | "running" | "paused" | "completed" | "failed"; starred: boolean; notes: string; chapters: Chapter[]; demo?: boolean; error?: string; model?: string; researchMode?: "manual" | "api"; };
export const ASSETS: Record<AssetType, string> = { equity: "Public equities", crypto: "Digital assets", private: "Private companies" };
export const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
export const uniqueSources = (chapters: Chapter[]) => {
  const map = new Map<string, Source>();
  chapters.forEach(c => c.sources.forEach(s => { const old = map.get(s.url); map.set(s.url, { ...s, cited: s.cited || !!old?.cited }); }));
  return [...map.values()];
};
