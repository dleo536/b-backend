export type MappingStage =
  | 'setup'
  | 'database_connection'
  | 'inventory_read'
  | 'spotify_search'
  | 'report_write'
  | 'report_read'
  | 'mapping_apply';

export class MappingCommandError extends Error {}

// Return only controlled messages and recognized codes. PostgreSQL errors can
// include query parameters, and network errors can include credentialed URLs.
export function describeMappingFailure(error: unknown, stage: MappingStage) {
  if (error instanceof MappingCommandError) return error.message;
  const value = error as any;
  const candidates = [
    value?.driverError?.code,
    value?.code,
    value?.cause?.code,
    ...(Array.isArray(value?.errors)
      ? value.errors.map((item: any) => item?.code)
      : []),
  ];
  const hints: Record<string, string> = {
    '28P01':
      'Hosted PostgreSQL rejected the login. Check DB_USERNAME and DB_PASSWORD against the deployed backend database credentials.',
    '28000':
      'PostgreSQL rejected authentication. Check the database user, authentication method, and database access settings.',
    '3D000':
      'The configured database does not exist. Check DB_NAME against the deployed backend.',
    '42P01':
      'A required database table is missing. Deploy the backend schema migration to this database before mapping albums.',
    '42703':
      'A required database column is missing. Check that the backend schema migrations completed on this database.',
    '42501':
      'The database user lacks permission for this operation. Check the database grants for the selected mapping mode.',
    ECONNREFUSED:
      'The database endpoint refused the connection. Keep the Cloud SQL proxy running and use its listening port (5433 in the setup guide).',
    ECONNRESET:
      'The database connection was closed. Check the Cloud SQL proxy terminal for connection or authorization errors.',
    ENOTFOUND:
      'The database hostname could not be resolved. Check DB_HOST; a local Cloud SQL proxy normally uses 127.0.0.1.',
    ETIMEDOUT:
      'The database connection timed out. Check the proxy, network access, and instance connection name.',
    EPERM:
      'The environment blocked the connection. Check sandbox or local network permissions.',
    EACCES:
      'Access was denied. Check network permissions and write access to the report directory.',
    EEXIST:
      'A report already exists at this path. Choose a new --report filename; existing reports are never overwritten.',
    ENOENT:
      'The requested report or directory does not exist. Use the existing reviewed JSON report for --apply.',
    ENOSPC:
      'The report could not be saved because the filesystem has no free space.',
    '23505':
      'A provider identity conflicts with an existing record. Review the mappings before applying.',
    '40001':
      'A concurrent database change interrupted this transaction. Generate a fresh dry-run report before retrying.',
  };
  const code = candidates.find(
    (candidate) =>
      typeof candidate === 'string' && Object.hasOwn(hints, candidate),
  );
  if (code)
    return `Spotify mapping failed at ${stage} [${code}]: ${hints[code]}`;
  if (
    typeof value?.message === 'string' &&
    value.message.includes('client password must be a string')
  ) {
    return `Spotify mapping failed at ${stage}: DB_PASSWORD is missing or invalid. Configure the hosted database password in the backend environment.`;
  }
  return `Spotify mapping failed at ${stage}. Check the configuration for this stage. Upstream error details were omitted to protect credentials.`;
}
