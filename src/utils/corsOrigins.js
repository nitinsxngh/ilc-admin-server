const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://admin.integratedlearningcircle.com',
];

export function getAllowedCorsOrigins() {
  const extra = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}
