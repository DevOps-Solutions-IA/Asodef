/** US-014 AC, verbatim: "formatted with Colombian Spanish thousands
 * separators (e.g. '8.405')" - Intl.NumberFormat("es-CO") produces
 * exactly that (period as the thousands separator). Kept in its own
 * file (not exported alongside StatisticsSection) so the component
 * file only exports components - react-refresh/only-export-components. */
export function formatColombianNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(value));
}
