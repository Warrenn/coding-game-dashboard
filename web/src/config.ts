// Runtime config loaded from /config.json (written by scripts/deploy.sh from
// CloudFormation outputs). Keeping config out of the bundle means swapping
// emails / re-pointing endpoints does NOT require a rebuild.

export interface AppConfig {
  region: string;
  identityPoolId: string;
  googleClientId: string;
  ledgerTable: string;
  lambdaUrl: string;
}

let cached: AppConfig | null = null;

const CONFIG_URL = '/config.json';

/** Test-only: clears the in-memory cache so the next loadConfig() refetches. */
export function _resetConfigCacheForTests(): void {
  cached = null;
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  const res = await fetch(CONFIG_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`config.json fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as Partial<AppConfig>;
  const required: (keyof AppConfig)[] = [
    'region',
    'identityPoolId',
    'googleClientId',
    'ledgerTable',
    'lambdaUrl',
  ];
  for (const k of required) {
    if (!data[k]) throw new Error(`config.json: missing ${k}`);
  }
  cached = data as AppConfig;
  return cached;
}
