import {
  describeMappingFailure,
  MappingCommandError,
} from './spotify-mapping-diagnostics';

describe('safe mapping failure diagnostics', () => {
  it('identifies hosted database authentication failures without echoing credentials', () => {
    const result = describeMappingFailure(
      {
        code: '28P01',
        message: 'password super-secret failed for user sensitive-user',
        query: 'sensitive SQL',
        parameters: ['super-secret'],
      },
      'database_connection',
    );
    expect(result).toContain('[28P01]');
    expect(result).toContain('DB_USERNAME and DB_PASSWORD');
    expect(result).not.toMatch(/super-secret|sensitive-user|sensitive SQL/);
  });
  it('unwraps TypeORM database errors and explains missing migrations', () => {
    expect(
      describeMappingFailure(
        { driverError: { code: '42P01', message: 'private query' } },
        'inventory_read',
      ),
    ).toContain('Deploy the backend schema migration');
  });
  it('handles nested connection failures and points to the configured proxy port', () => {
    expect(
      describeMappingFailure(
        { errors: [{ code: 'ECONNREFUSED' }] },
        'database_connection',
      ),
    ).toContain('5433');
  });
  it('distinguishes existing reports from connection failures', () => {
    const result = describeMappingFailure(
      { code: 'EEXIST', path: '/private/path' },
      'report_write',
    );
    expect(result).toContain('Choose a new --report filename');
    expect(result).not.toContain('/private/path');
  });
  it('never logs unknown upstream bodies, URLs, or arbitrary error codes', () => {
    const result = describeMappingFailure(
      {
        code: 'secret-code',
        message: 'https://user:password@host?token=secret',
        body: 'secret body',
      },
      'database_connection',
    );
    expect(result).toContain('database_connection');
    expect(result).not.toMatch(/password|secret-code|token=secret|secret body/);
  });
  it('identifies an unset PostgreSQL password without exposing the original message', () => {
    expect(
      describeMappingFailure(
        new Error('SASL: client password must be a string'),
        'database_connection',
      ),
    ).toContain('DB_PASSWORD is missing');
  });
  it('preserves controlled command validation messages', () => {
    expect(
      describeMappingFailure(
        new MappingCommandError('--apply requires a reviewed dry-run report'),
        'setup',
      ),
    ).toBe('--apply requires a reviewed dry-run report');
  });
});
