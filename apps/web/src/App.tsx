import { ASODEF_COMPANY } from "@asodef/config";

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-bg-base px-4 text-center">
      <h1 className="font-display text-4xl font-semibold text-brand-dark">{ASODEF_COMPANY.legalName}</h1>
      <p className="font-sans text-text-muted">{ASODEF_COMPANY.tagline}</p>
    </main>
  );
}
