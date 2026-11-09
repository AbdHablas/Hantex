import { z } from 'zod';
import { budgetIssues, DESKTOP_BUDGET, MOBILE_BUDGET, type BudgetIssue } from './model-budgets';
import type { ResultLabel } from './types';

/**
 * The technical quality gate (D-029 §6, "Quality gates"): checks a processed model can be
 * measured against without a person's judgement. The processing runner stores what it measured
 * in these shapes; the dashboard API runs `technicalGate` on them and refuses "ready for
 * approval" and approval while it reports anything. Orientation and origin aren't checked here:
 * software can't tell reliably which way a product should face, so they stay on the reviewer's
 * checklist (a model turned on its side does fail the per-axis scale check, though).
 */

const versionMeasurements = z.object({
  bytes: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  maxTextureSize: z.number().int().nonnegative(),
});

export const modelMeasurementsSchema = z.object({
  desktop: versionMeasurements,
  mobile: versionMeasurements,
  /** World-space size of the model as uploaded, in mm; null if it has no geometry. */
  boundingBoxMm: z.object({ width: z.number(), height: z.number(), depth: z.number() }).nullable(),
  /** Primitives with no material: with finish variants, every finish then lacks one too. */
  primitivesWithoutMaterial: z.number().int().nonnegative(),
});
export type ModelMeasurementsResult = z.infer<typeof modelMeasurementsSchema>;

const versionReport = z.object({
  numErrors: z.number().int().nonnegative(),
  numWarnings: z.number().int().nonnegative(),
  messages: z.array(z.string()),
});

/** The Khronos glTF validator's report on each published version. */
export const validatorReportSchema = z.object({ desktop: versionReport, mobile: versionReport });
export type ValidatorReportResult = z.infer<typeof validatorReportSchema>;

export type ModelVersion = 'desktop' | 'mobile';

export type TechnicalIssue =
  | { check: 'validator'; version: ModelVersion; errors: number }
  | { check: 'budget'; version: ModelVersion; budget: BudgetIssue }
  | { check: 'scale'; reason: 'no-dimensions' | 'mismatch' }
  | { check: 'materials'; missing: number }
  /** The stored result doesn't have the expected shape: never treated as passing. */
  | { check: 'unreadable' };

/**
 * Labels that promise true scale ("view on your wall"), so their dimensions must check out
 * (D-029 §6, "Result types and labels"). A captured view never claims true scale, and an
 * AI estimate only does once corrected — which makes it a new, artist-modelled version.
 */
export const TRUE_SCALE_LABELS: readonly ResultLabel[] = [
  'exact-cad',
  'measured',
  'artist-modelled',
];

export interface ModelResult {
  label: ResultLabel;
  measurements: unknown;
  validatorReport: unknown;
  withinScale: boolean | null;
}

/** Every way a processed model fails the technical gate; empty when it passes. */
export function technicalGate(model: ModelResult): TechnicalIssue[] {
  const measurements = modelMeasurementsSchema.safeParse(model.measurements);
  const report = validatorReportSchema.safeParse(model.validatorReport);
  if (!measurements.success || !report.success) return [{ check: 'unreadable' }];

  const issues: TechnicalIssue[] = [];
  for (const version of ['desktop', 'mobile'] as const) {
    const errors = report.data[version].numErrors;
    if (errors > 0) issues.push({ check: 'validator', version, errors });
    const budget = version === 'desktop' ? DESKTOP_BUDGET : MOBILE_BUDGET;
    for (const issue of budgetIssues(measurements.data[version], budget)) {
      issues.push({ check: 'budget', version, budget: issue });
    }
  }
  if (TRUE_SCALE_LABELS.includes(model.label)) {
    if (model.withinScale === null) issues.push({ check: 'scale', reason: 'no-dimensions' });
    else if (!model.withinScale) issues.push({ check: 'scale', reason: 'mismatch' });
  }
  const missing = measurements.data.primitivesWithoutMaterial;
  if (missing > 0) issues.push({ check: 'materials', missing });
  return issues;
}

/**
 * The reviewer's feature checklist (D-029 §6, "Human review"). A model is marked ready for
 * approval only with every item checked; the API refuses it otherwise.
 */
export const REVIEW_CHECKS = [
  'shape',
  'buttons',
  'openings',
  'markings',
  'finish',
  'nothingInvented',
] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number];
