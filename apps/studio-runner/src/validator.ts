import { createRequire } from 'node:module';

/**
 * The Khronos glTF validator (gltf-validator), which ships without type definitions: loaded
 * as the CommonJS package it is, with the parts of its report the pipeline reads.
 */

export interface ValidationMessage {
  code: string;
  /** 0 Error, 1 Warning, 2 Information, 3 Hint. */
  severity: 0 | 1 | 2 | 3;
  message: string;
  pointer?: string;
}

export interface ValidationReport {
  issues: {
    numErrors: number;
    numWarnings: number;
    numInfos: number;
    numHints: number;
    messages: ValidationMessage[];
    truncated: boolean;
  };
}

const load = createRequire(import.meta.url);

export const { validateBytes } = load('gltf-validator') as {
  validateBytes: (
    bytes: Uint8Array,
    options?: Record<string, unknown>,
  ) => Promise<ValidationReport>;
};
