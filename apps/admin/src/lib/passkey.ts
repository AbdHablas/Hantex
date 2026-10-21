import {
  WebAuthnError,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { ApiError, api } from './api';

/**
 * Passkey sign-in and enrolment (D-007) against Better Auth's passkey endpoints. Staff prove
 * who they are with their device's fingerprint, face or PIN; there are no passwords.
 */

const cancelled = (error: unknown) =>
  error instanceof WebAuthnError ||
  (error instanceof DOMException && error.name === 'NotAllowedError');

export async function signInWithPasskey(): Promise<void> {
  const options = await api<PublicKeyCredentialRequestOptionsJSON>(
    '/auth/passkey/generate-authenticate-options',
  );
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    if (cancelled(error)) throw new ApiError(400, 'passkey-cancelled');
    throw error;
  }
  const { clientExtensionResults: _ignored, ...body } = response;
  await api('/auth/passkey/verify-authentication', { method: 'POST', body: { response: body } });
}

/**
 * Registers a passkey. With a ticket (from an invitation or account recovery) it works without
 * a session and signs the person in; without one, it adds a device to the signed-in account.
 */
export async function registerPasskey(input: { ticket?: string; name?: string }): Promise<void> {
  const query = new URLSearchParams();
  if (input.ticket) query.set('context', input.ticket);
  if (input.name) query.set('name', input.name);
  const options = await api<PublicKeyCredentialCreationOptionsJSON>(
    `/auth/passkey/generate-register-options?${query.toString()}`,
  );
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (error) {
    if (cancelled(error)) throw new ApiError(400, 'passkey-cancelled');
    throw error;
  }
  const { clientExtensionResults: _ignored, ...body } = response;
  await api('/auth/passkey/verify-registration', {
    method: 'POST',
    body: { response: body, name: input.name, ...(input.ticket ? { createSession: true } : {}) },
  });
}
