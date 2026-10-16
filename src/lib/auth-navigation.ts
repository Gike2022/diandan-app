export function safeNext(value: string | null) {
  return value && (/^\/(?:cart|checkout|orders|profile)?$/.test(value) || /^\/orders\/[a-f0-9-]{36}$/.test(value) || /^\/admin(?:\/(?:menu|categories|statistics))?$/.test(value)) ? value : "/";
}
