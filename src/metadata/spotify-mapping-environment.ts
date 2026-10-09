import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { MappingCommandError } from './spotify-mapping-diagnostics';

// Load exactly one file. Explicit shell variables retain dotenv's normal
// precedence, so DB_HOST/DB_PORT can select a local proxy for .env.prod.
export function loadMappingEnvironment(
  file: string | undefined,
  inherited: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
) {
  const path = resolve(cwd, file || '.env');
  let parsed: Record<string, string> = {};
  try {
    parsed = parse(readFileSync(path));
  } catch (error) {
    if (file || error?.code !== 'ENOENT') {
      throw new MappingCommandError(
        'Cannot read the selected environment file. Check --env-file and file permissions. No database was contacted.',
      );
    }
  }
  const values = { ...parsed };
  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined) values[key] = value;
  }
  return { path, values };
}
