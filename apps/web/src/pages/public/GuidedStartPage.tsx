import { PublicHero } from "../../components/public/PublicPage";

/** Replaced by the fully integrated guided workflow in US-120. Kept as a
 * real route boundary while the information architecture lands first. */
export function GuidedStartPage() {
  return <PublicHero eyebrow="Orientador ASODEF" title="Encuentra el canal que corresponde" description="Selecciona tu perfil y necesidad para continuar en el proceso adecuado." />;
}
