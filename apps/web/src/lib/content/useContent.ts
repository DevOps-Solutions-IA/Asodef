import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetchPublishedContent } from "./content-api";
import { toContentMap, type ContentMap } from "./content-types";

const EMPTY_CONTENT: ContentMap = {};

/**
 * Always returns a usable ContentMap - {} while loading or on any
 * failure, never throws and never surfaces isError to the caller.
 * Callers do `content["some.key"] ?? HARDCODED_FALLBACK`, so a missing
 * key (unavailable API, key not yet seeded, etc.) transparently falls
 * through to the same approved copy already on the page today (US-020's
 * negative case: "the homepage still renders complete, correct fallback
 * copy - no blank sections").
 */
export function useContent(): ContentMap {
  const { data } = useQuery({
    queryKey: queryKeys.content.all(),
    queryFn: ({ signal }) => fetchPublishedContent(signal),
    select: toContentMap,
  });

  return data ?? EMPTY_CONTENT;
}
