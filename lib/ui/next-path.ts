// Only same-site relative paths are allowed as post-sign-in destinations.
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
