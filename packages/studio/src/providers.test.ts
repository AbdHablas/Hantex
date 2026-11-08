import { describe, expect, it } from 'vitest';
import { PROVIDERS, providerById } from './providers';

describe('providers', () => {
  it('ships exactly the providers the design doc commits to for stage 1', () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual(['cad-step', 'model-import']);
  });

  it('never marks a provider implemented unless its processing is actually built', () => {
    expect(providerById('model-import')?.implemented).toBe(true);
    // No CAD conversion pipeline exists yet (D-029): never claimed as working.
    expect(providerById('cad-step')?.implemented).toBe(false);
  });

  it('looks up a provider by id, and finds nothing for an unknown one', () => {
    expect(providerById('nope')).toBeUndefined();
  });
});
