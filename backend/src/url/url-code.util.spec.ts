import {
  generateUniqueShortCode,
  ShortCodeGenerationExhaustedException,
  SHORT_CODE_LENGTH,
} from './url-code.util';

class CollisionError extends Error {}
class OtherError extends Error {}

const isCollision = (error: unknown): boolean => error instanceof CollisionError;

describe('generateUniqueShortCode', () => {
  it('succeeds on the first attempt when there is no collision', async () => {
    const attemptInsert = jest.fn<Promise<string>, [string]>().mockResolvedValue('inserted');

    const result = await generateUniqueShortCode(attemptInsert, isCollision);

    expect(result).toBe('inserted');
    expect(attemptInsert).toHaveBeenCalledTimes(1);
    const candidate = attemptInsert.mock.calls[0][0];
    expect(candidate).toHaveLength(SHORT_CODE_LENGTH);
  });

  it('retries with a new candidate after a collision, then succeeds', async () => {
    const attemptInsert = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new CollisionError())
      .mockRejectedValueOnce(new CollisionError())
      .mockResolvedValueOnce('inserted');

    const result = await generateUniqueShortCode(attemptInsert, isCollision);

    expect(result).toBe('inserted');
    expect(attemptInsert).toHaveBeenCalledTimes(3);
    const [first, second, third] = attemptInsert.mock.calls.map((call) => call[0]);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('gives up after the maximum number of attempts, all collisions', async () => {
    const attemptInsert = jest.fn().mockRejectedValue(new CollisionError());

    await expect(generateUniqueShortCode(attemptInsert, isCollision)).rejects.toThrow(
      ShortCodeGenerationExhaustedException,
    );
    expect(attemptInsert).toHaveBeenCalledTimes(5);
  });

  it('does not retry and rethrows immediately on a non-collision error', async () => {
    const attemptInsert = jest.fn().mockRejectedValue(new OtherError('db is down'));

    await expect(generateUniqueShortCode(attemptInsert, isCollision)).rejects.toThrow(OtherError);
    expect(attemptInsert).toHaveBeenCalledTimes(1);
  });
});
