import { useQuery } from "@tanstack/react-query";
import { Alert } from "@asodef/ui";
import type { ProviderCollection, ProviderPayload, ResourceResult } from "../../lib/self-service";
import { ProviderDataView } from "./ProviderDataView";
import { SelfServiceStatePanel } from "./SelfServiceStatePanel";

export function SelfServiceCollectionSection({ title, description, queryKey, queryFn }: {
  title: string;
  description: string;
  queryKey: readonly unknown[];
  queryFn: (signal?: AbortSignal) => Promise<ResourceResult<ProviderPayload | ProviderCollection>>;
}) {
  const query = useQuery({ queryKey, queryFn: ({ signal }) => queryFn(signal), retry: false });
  const headingId = `section-${String(queryKey.at(-1))}`;
  return <section aria-labelledby={headingId} className="space-y-4"><div><h2 id={headingId} className="font-display text-xl font-semibold text-brand-dark">{title}</h2><p className="mt-1 text-sm text-text-muted">{description}</p></div>{query.isPending ? <SelfServiceStatePanel status="loading" /> : query.isError ? <SelfServiceStatePanel status="unavailable" onRetry={() => void query.refetch()} /> : query.data.status === "success" || query.data.status === "partial" ? <>{query.data.status === "partial" && <Alert variant="warning">{query.data.message}</Alert>}<ProviderDataView data={query.data.data} /></> : <SelfServiceStatePanel status={query.data.status} message={query.data.message} onRetry={query.data.status === "unavailable" ? () => void query.refetch() : undefined} />}</section>;
}
