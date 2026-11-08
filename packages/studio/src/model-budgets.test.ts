import { describe, expect, it } from 'vitest';
import { budgetIssues, DESKTOP_BUDGET, MOBILE_BUDGET, withinScaleTolerance } from './model-budgets';

describe('budgetIssues', () => {
  it('passes a model within every limit', () => {
    expect(
      budgetIssues({ bytes: 1_000_000, triangles: 50_000, maxTextureSize: 1024 }, DESKTOP_BUDGET),
    ).toEqual([]);
  });

  it('reports each limit a model is over', () => {
    const issues = budgetIssues(
      { bytes: 4_000_000, triangles: 200_000, maxTextureSize: 4096 },
      DESKTOP_BUDGET,
    );
    expect(issues.map((i) => i.check).sort()).toEqual(['bytes', 'texture-size', 'triangles']);
  });

  it('the mobile budget is stricter than the desktop one', () => {
    const measured = { bytes: 2_000_000, triangles: 75_000, maxTextureSize: 2048 };
    expect(budgetIssues(measured, DESKTOP_BUDGET)).toEqual([]);
    expect(budgetIssues(measured, MOBILE_BUDGET).length).toBeGreaterThan(0);
  });
});

describe('withinScaleTolerance', () => {
  const entered = { width: 100, height: 80, depth: 40 };

  it('passes an exact match and a match within 2%', () => {
    expect(withinScaleTolerance(entered, entered)).toBe(true);
    expect(withinScaleTolerance({ width: 101.9, height: 80, depth: 40 }, entered)).toBe(true);
  });

  it('fails once any dimension is more than 2% off', () => {
    expect(withinScaleTolerance({ width: 103, height: 80, depth: 40 }, entered)).toBe(false);
    expect(withinScaleTolerance({ width: 100, height: 80, depth: 30 }, entered)).toBe(false);
  });
});
