import { Alert, PageHeader } from "@asodef/ui";
import { useQuery } from "@tanstack/react-query";
import type { ProviderCollection, ProviderPayload, ResourceResult } from "../../lib/self-service";
import { ProviderDataView } from "./ProviderDataView";
import { SelfServiceStatePanel } from "./SelfServiceStatePanel";

export function SelfServiceResourcePage({ queryKey, queryFn, title, description, eyebrow, actions }: {
  queryKey: readonly unknown[];
  queryFn: (signal?: AbortSignal) => Promise<ResourceResult<ProviderPayload | ProviderCollection>>;
  title: string;
  description: string;
  eyebrow: string;
  actions?: React.ReactNode;
}) {
  const query = useQuery({ queryKey, queryFn: ({ signal }) => queryFn(signal), retry: false });
  let content: React.ReactNode;
  if (query.isPending) content = <SelfServiceStatePanel status="loading" />;
  else if (query.isError) content = <SelfServiceStatePanel status="unavailable" onRetry={() => void query.refetch()} />;
  else if (query.data.status === "success" || query.data.status === "partial") {
    content = <>{query.data.status === "partial" && <Alert className="mb-4" variant="warning" title="Información parcial">{query.data.message}</Alert>}<ProviderDataView data={query.data.data} /></>;
  } else content = <SelfServiceStatePanel status={query.data.status} message={query.data.message} onRetry={query.data.status === "unavailable" ? () => void query.refetch() : undefined} />;
  return <div className="space-y-6"><PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} />{content}</div>;
}
