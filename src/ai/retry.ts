// Simple promise-based sleep function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MaxRetries = 5;
const InitialRetryDelay = 1000; // 1 second

interface RetryOptions {
  maxRetries?: number;
  initialRetryDelay?: number;
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MaxRetries;
  const initialRetryDelay = options.initialRetryDelay ?? InitialRetryDelay;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Only retry on rate limit errors
      if (!error.message?.toLowerCase().includes('rate limit')) {
        throw error;
      }

      if (attempt === maxRetries - 1) {
        throw new Error(
          `Failed after ${maxRetries} attempts with error: ${lastError?.message}`,
        );
      }

      // Extract wait time from error message if available
      let waitTime = null;
      const waitMatch = error.message.match(/try again in (\d+\.?\d*)s/i);
      if (waitMatch) {
        waitTime = Math.ceil(parseFloat(waitMatch[1]) * 1000);
      }

      // If we couldn't extract wait time, use exponential backoff
      if (!waitTime) {
        waitTime = initialRetryDelay * Math.pow(2, attempt);
      }

      console.log(
        `Rate limit reached, retrying in ${waitTime}ms (attempt ${
          attempt + 1
        }/${maxRetries})`,
      );
      await sleep(waitTime);
    }
  }

  throw lastError;
} 