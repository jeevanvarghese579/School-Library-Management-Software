import { describe, expect, it } from 'vitest';
import { subscribeToCloudSync, trackCloudOperation } from './cloudSync';

describe('cloud sync tracking', () => {
  it('reports a pending operation until its cloud promise settles', async () => {
    const counts: number[] = [];
    let resolveOperation: (() => void) | undefined;
    const operation = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });
    const unsubscribe = subscribeToCloudSync((count) => counts.push(count));

    const tracked = trackCloudOperation(operation);
    expect(counts).toEqual([0, 1]);
    resolveOperation?.();
    await tracked;
    await Promise.resolve();

    expect(counts).toEqual([0, 1, 0]);
    unsubscribe();
  });
});
