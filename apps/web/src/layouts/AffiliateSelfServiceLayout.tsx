/* eslint-disable react-refresh/only-export-components */
import { Bell, CreditCard, FileText, HandCoins, HeartHandshake, LayoutDashboard, ReceiptText, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@asodef/ui";
import { SelfServiceShell, type SelfServiceNavItem } from "../components/self-service";
import { useAffiliateSelfService } from "../lib/self-service";

export const AFFILIATE_SELF_SERVICE_NAV: readonly SelfServiceNavItem[] = [
  { to: "/mi-cuenta", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/mi-cuenta/afiliacion", label: "Mi afiliación", icon: HeartHandshake },
  { to: "/mi-cuenta/beneficiarios", label: "Beneficiarios", icon: UsersRound },
  { to: "/mi-cuenta/estado-de-cuenta", label: "Estado de cuenta", icon: ReceiptText },
  { to: "/mi-cuenta/pagos", label: "Pagos y comprobantes", icon: CreditCard },
  { to: "/mi-cuenta/documentos", label: "Documentos", icon: FileText },
  { to: "/mi-cuenta/solicitudes", label: "Solicitudes", icon: HandCoins },
  { to: "/mi-cuenta/notificaciones", label: "Notificaciones", icon: Bell },
];

export function AffiliateSelfServiceLayout() {
  const { endSession } = useAffiliateSelfService();
  return <SelfServiceShell title="Mi cuenta ASODEF" navLabel="Autoservicio de afiliados" items={AFFILIATE_SELF_SERVICE_NAV} footer={<div className="flex flex-col gap-2"><Link to="/legal/condiciones-portal-afiliado" className="hover:underline">Condiciones del portal</Link><Link to="/legal/politica-de-privacidad" className="hover:underline">Privacidad</Link><Button variant="ghost" size="sm" className="mt-2 justify-start" onClick={() => void endSession()}>Cerrar sesión</Button></div>} />;
}
