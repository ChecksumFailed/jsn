import { describe, it } from 'node:test';
import assert from 'node:assert';
import { cli } from '../src/cli.js';

describe('CLI smoke tests', () => {
  it('should parse without error', () => {
    // Just verify the CLI object exists and is a yargs instance
    assert.ok(cli, 'CLI should be defined');
    assert.ok(typeof cli.parse === 'function', 'CLI should have parse method');
  });
});

describe('Config', () => {
  it('normalizes instance URLs', async () => {
    const { normalizeInstanceURL } = await import('../src/config.js');
    assert.strictEqual(normalizeInstanceURL('dev12345.service-now.com'), 'https://dev12345.service-now.com');
    assert.strictEqual(normalizeInstanceURL('https://dev12345.service-now.com/'), 'https://dev12345.service-now.com');
  });
});

describe('Helpers', () => {
  it('extracts string fields from records', async () => {
    const { getStringField } = await import('../src/helpers.js');
    assert.strictEqual(getStringField({ number: 'INC001' }, 'number'), 'INC001');
    assert.strictEqual(getStringField({ number: { display_value: 'INC001', value: 'abc' } }, 'number'), 'INC001');
    assert.strictEqual(getStringField({}, 'missing'), '');
  });
});

describe('Errors', () => {
  it('creates structured errors', async () => {
    const { errUsage, errAuth, AppError } = await import('../src/errors.js');
    const e = errUsage('test error');
    assert.ok(e instanceof AppError);
    assert.strictEqual(e.code, 'usage_error');
    assert.strictEqual(e.message, 'test error');

    const authErr = errAuth('no token');
    assert.strictEqual(authErr.code, 'auth_error');
    assert.ok(authErr.hint.includes('jsn auth login'));
  });
});
