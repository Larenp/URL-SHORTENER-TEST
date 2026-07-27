import { customAlphabet } from 'nanoid';

export const SHORT_CODE_LENGTH = 7;
export const CUSTOM_CODE_MIN_LENGTH = 3;
export const CUSTOM_CODE_MAX_LENGTH = 32;
export const CUSTOM_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

const MAX_GENERATION_ATTEMPTS = 5;

// Alphanumeric only — avoids the ambiguity of nanoid's default alphabet
// including "-" and "_", which are legal in a URL path segment but read
// poorly in a shared/printed short link.
const generateCandidate = customAlphabet(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  SHORT_CODE_LENGTH,
);

export class ShortCodeGenerationExhaustedException extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique short code after ${attempts} attempts`);
    this.name = 'ShortCodeGenerationExhaustedException';
  }
}

/**
 * Generates a short code and hands it to `attemptInsert`, which is
 * expected to throw if the code collides (a unique-constraint violation
 * at the database) and resolve otherwise. Retries with a fresh candidate
 * on collision — deliberately attempt-then-catch rather than
 * check-then-insert, since a separate existence check would leave a race
 * window between checking and inserting.
 */
export async function generateUniqueShortCode<T>(
  attemptInsert: (candidate: string) => Promise<T>,
  isCollisionError: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateCandidate();
    try {
      return await attemptInsert(candidate);
    } catch (error) {
      if (!isCollisionError(error)) {
        throw error;
      }
      // A genuine collision — the loop retries with a fresh candidate.
    }
  }

  throw new ShortCodeGenerationExhaustedException(MAX_GENERATION_ATTEMPTS);
}
