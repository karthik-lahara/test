import { describe, expect, it } from 'vitest';

import { listCallsQuerySchema } from './call.validation';

describe('listCallsQuerySchema', () => {
  it('accepts company-day date filters and parses boolean query values', () => {
    const result = listCallsQuerySchema.safeParse({
      from: '2026-10-27',
      to: '2026-10-28',
      flagged: 'false',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBe('2026-10-27');
      expect(result.data.to).toBe('2026-10-28');
      expect(result.data.flagged).toBe(false);
    }
  });

  it('rejects invalid dates and a range where from is after to', () => {
    expect(listCallsQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(listCallsQuerySchema.safeParse({ from: '2026-10-28', to: '2026-10-27' }).success).toBe(
      false,
    );
  });

  it('defaults to the newest calls and rejects unsupported filters', () => {
    const result = listCallsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('startedAt');
      expect(result.data.dir).toBe('desc');
    }

    expect(listCallsQuerySchema.safeParse({ flagged: 'yes' }).success).toBe(false);
    expect(listCallsQuerySchema.safeParse({ sort: 'number' }).success).toBe(false);
  });
});
