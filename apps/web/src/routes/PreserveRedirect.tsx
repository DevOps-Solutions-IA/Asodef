import { Navigate, useLocation } from "react-router-dom";

export function PreserveRedirect({ to }: { to: string }) {
  const location = useLocation();
  const [path, targetHash = ""] = to.split("#");
  return <Navigate replace to={`${path}${location.search}${targetHash ? `#${targetHash}` : location.hash}`} />;
}
