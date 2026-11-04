import { describe, expect, it } from 'vitest';
import { enquiryRequestSchema } from './enquiry';

describe('enquiryRequestSchema (D-051)', () => {
  const valid = {
    kind: 'quote',
    productId: 'prdone01',
    name: 'Sam',
    contact: 'sam@example.com',
    company: 'Sam & Co',
    quantity: 20,
    message: 'Price for 20?\nDelivery to Aleppo.',
    consent: true,
    locale: 'en',
    turnstileToken: 'token',
  };

  it('accepts a complete enquiry, with line breaks in the message', () => {
    expect(enquiryRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      enquiryRequestSchema.safeParse({ ...valid, productId: null, quantity: null, kind: 'enquiry' })
        .success,
    ).toBe(true);
  });

  it('requires consent, a name and a message', () => {
    expect(enquiryRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, message: '' }).success).toBe(false);
  });

  it('refuses control characters, odd quantities, unknown fields and product ids', () => {
    expect(enquiryRequestSchema.safeParse({ ...valid, name: 'Sam\u0000' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, company: 'A\nB' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, quantity: 1.5 }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, status: 'closed' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, productName: 'Free' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, productId: '../x' }).success).toBe(false);
    expect(enquiryRequestSchema.safeParse({ ...valid, message: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });
});
