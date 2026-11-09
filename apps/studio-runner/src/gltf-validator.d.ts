declare module 'gltf-validator' {
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

  export function validateBytes(
    bytes: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<ValidationReport>;
}
