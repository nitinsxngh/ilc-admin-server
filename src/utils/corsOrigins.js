const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://admin.integratedlearningcircle.com',
];

export function getAllowedCorsOrigins() {
  const extra = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  const normalized = String(origin).trim().replace(/\/$/, '');
  if (getAllowedCorsOrigins().includes(normalized)) return true;
  try {
    const { hostname, protocol } = new URL(normalized);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return (
      hostname === 'integratedlearningcircle.com' ||
      hostname.endsWith('.integratedlearningcircle.com')
    );
  } catch {
    return false;
  }
}
