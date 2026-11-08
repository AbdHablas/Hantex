/**
 * Website model budgets (D-029 §6, following the Khronos 3D Commerce guidelines and Google's
 * Scene Viewer recommendation). The processing pipeline targets these; the technical quality
 * gate checks the result against them.
 */
export interface ModelBudget {
  maxBytes: number;
  maxTriangles: number;
  maxTextureSize: number;
}

export const DESKTOP_BUDGET: ModelBudget = {
  maxBytes: 3 * 1024 * 1024,
  maxTriangles: 100_000,
  maxTextureSize: 2048,
};

export const MOBILE_BUDGET: ModelBudget = {
  maxBytes: 1.5 * 1024 * 1024,
  maxTriangles: 50_000,
  maxTextureSize: 1024,
};

export interface ModelMeasurements {
  bytes: number;
  triangles: number;
  maxTextureSize: number;
}

export interface BudgetIssue {
  check: 'bytes' | 'triangles' | 'texture-size';
  measured: number;
  limit: number;
}

/** Every way a model misses its budget; empty when it fits. */
export function budgetIssues(measured: ModelMeasurements, budget: ModelBudget): BudgetIssue[] {
  const issues: BudgetIssue[] = [];
  if (measured.bytes > budget.maxBytes) {
    issues.push({ check: 'bytes', measured: measured.bytes, limit: budget.maxBytes });
  }
  if (measured.triangles > budget.maxTriangles) {
    issues.push({ check: 'triangles', measured: measured.triangles, limit: budget.maxTriangles });
  }
  if (measured.maxTextureSize > budget.maxTextureSize) {
    issues.push({
      check: 'texture-size',
      measured: measured.maxTextureSize,
      limit: budget.maxTextureSize,
    });
  }
  return issues;
}

/** The scale check (D-029 §5.4, §6): the model's own measured size against the datasheet, ±2%. */
export const SCALE_TOLERANCE = 0.02;

export interface Size3 {
  width: number;
  height: number;
  depth: number;
}

/** Whether a model's measured bounding box (mm) matches the entered real dimensions, within 2%. */
export function withinScaleTolerance(measuredMm: Size3, enteredMm: Size3): boolean {
  const within = (measured: number, entered: number) =>
    entered > 0 && Math.abs(measured - entered) / entered <= SCALE_TOLERANCE;
  return (
    within(measuredMm.width, enteredMm.width) &&
    within(measuredMm.height, enteredMm.height) &&
    within(measuredMm.depth, enteredMm.depth)
  );
}
