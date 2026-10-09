import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMappingEnvironment } from './spotify-mapping-environment';

describe('mapping environment selection', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'bsides-mapping-env-'));
    writeFileSync(
      join(cwd, '.env'),
      'DB_NAME=local_db\nDB_USERNAME=local_user\nDB_PASSWORD=local_password\nSPOTIFY_CLIENT_SECRET=local_only_secret\n',
    );
    writeFileSync(
      join(cwd, '.env.prod'),
      'DB_NAME=hosted_db\nDB_USERNAME=hosted_user\nDB_PASSWORD="hosted password $literal"\nDB_HOST=/cloudsql/test-instance\nDB_PORT=5432\n',
    );
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('defaults to the local .env for existing commands', () => {
    expect(loadMappingEnvironment(undefined, {}, cwd).values.DB_NAME).toBe(
      'local_db',
    );
  });
  it('selects production credentials without mixing in local .env values', () => {
    const { values } = loadMappingEnvironment('.env.prod', {}, cwd);
    expect(values.DB_NAME).toBe('hosted_db');
    expect(values.DB_USERNAME).toBe('hosted_user');
    expect(values.DB_PASSWORD).toBe('hosted password $literal');
    expect(values.SPOTIFY_CLIENT_SECRET).toBeUndefined();
  });
  it('preserves explicit shell overrides for the production proxy endpoint', () => {
    const { values } = loadMappingEnvironment(
      '.env.prod',
      { DB_HOST: '127.0.0.1', DB_PORT: '5433' },
      cwd,
    );
    expect(values.DB_HOST).toBe('127.0.0.1');
    expect(values.DB_PORT).toBe('5433');
    expect(values.DB_NAME).toBe('hosted_db');
    expect(values.DB_PASSWORD).toBe('hosted password $literal');
  });
  it('fails before connecting if an explicitly selected file is missing', () => {
    expect(() => loadMappingEnvironment('.env.missing', {}, cwd)).toThrow(
      'No database was contacted',
    );
  });
  it('supports shell-only deployment configuration when default .env is absent', () => {
    const { values } = loadMappingEnvironment(
      undefined,
      { DB_NAME: 'shell_db' },
      join(cwd, 'absent'),
    );
    expect(values.DB_NAME).toBe('shell_db');
  });
});
