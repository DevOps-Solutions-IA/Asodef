import { Outlet } from "react-router-dom";
import { PublicHeader } from "./shared/PublicHeader";
import { SkipToContent } from "./shared/SkipToContent";

export function SelfServiceAccessLayout() {
  return <div className="min-h-screen bg-bg-soft"><SkipToContent targetId="main-content" /><PublicHeader /><main id="main-content" tabIndex={-1} className="px-4 py-6 focus:outline-none sm:px-6 sm:py-10 lg:px-8 lg:py-14"><Outlet /></main></div>;
}
