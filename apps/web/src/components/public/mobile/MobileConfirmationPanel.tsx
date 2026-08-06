import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { CopyReferenceAction } from "./CopyReferenceAction";

export interface MobileConfirmationPanelProps {
  title: string;
  description: string;
  reference?: string;
  children?: ReactNode;
}

export function MobileConfirmationPanel({ title, description, reference, children }: MobileConfirmationPanelProps) {
  return <section role="status" aria-labelledby="confirmation-heading" className="rounded-[1.75rem] border border-success/20 bg-white p-6 text-center shadow-e3 sm:p-9"><span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="h-8 w-8" /></span><h2 id="confirmation-heading" className="mt-5 font-display text-3xl font-semibold tracking-[-.035em] text-text-main">{title}</h2><p className="mx-auto mt-3 max-w-xl leading-7 text-text-muted">{description}</p>{reference ? <div className="mt-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-text-muted">Referencia</p><p className="mt-2 break-all font-mono text-xl font-bold text-brand-dark">{reference}</p><div className="mt-4 flex justify-center"><CopyReferenceAction value={reference} /></div></div> : null}{children ? <div className="mt-7 border-t border-brand-dark/10 pt-6">{children}</div> : null}</section>;
}
