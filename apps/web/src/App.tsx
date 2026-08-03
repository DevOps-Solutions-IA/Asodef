import { ASODEF_COMPANY } from "@asodef/config";

export function App() {
  return (
    <main>
      <h1>{ASODEF_COMPANY.legalName}</h1>
      <p>{ASODEF_COMPANY.tagline}</p>
    </main>
  );
}
