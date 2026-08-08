export function shouldShowInitialPreloader(pathname: string) {
  return !pathname.startsWith("/legal");
}
