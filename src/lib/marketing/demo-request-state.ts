/**
 * The demo form's state, shared by the form (client) and the server action.
 * No server imports here: this module is bundled into the client.
 */

export type DemoRequestField = 'name' | 'academy' | 'phone' | 'branches' | 'sport';

export const DEMO_REQUEST_FIELDS: readonly DemoRequestField[] = ['name', 'academy', 'phone', 'branches', 'sport'];

export interface DemoRequestState {
  status: 'idle' | 'success' | 'error';
  /** Which message to show above the form. Field messages come from `fieldErrors`. */
  error?: 'generic' | 'rateLimited' | 'fields';
  fieldErrors?: Partial<Record<DemoRequestField, true>>;
  /** What was submitted, so a failed attempt doesn't wipe what the visitor typed. */
  values?: Partial<Record<DemoRequestField, string>>;
  /** The visitor's name, for the thank-you message. */
  name?: string;
}

export const INITIAL_DEMO_REQUEST_STATE: DemoRequestState = { status: 'idle' };
