import { createOpenAI, type OpenAIProviderSettings } from '@ai-sdk/openai';
import { getEncoding } from 'js-tiktoken';

import { RecursiveCharacterTextSplitter } from './text-splitter';
import { withExponentialBackoff } from './retry';

interface CustomOpenAIProviderSettings extends OpenAIProviderSettings {
  baseURL?: string;
}

// Create base provider
const baseProvider = createOpenAI({
  apiKey: process.env.OPENAI_KEY!,
  baseURL: process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1',
} as CustomOpenAIProviderSettings);

// Create wrapped provider that retries on rate limits
const openai = (model: string, options?: any) => {
  const provider = baseProvider(model, options);
  const wrapped = provider;

  // Wrap the original doGenerate method
  const originalDoGenerate = wrapped.doGenerate.bind(wrapped);
  wrapped.doGenerate = async function(input: any) {
    try {
      return await withExponentialBackoff(() => originalDoGenerate(input));
    } catch (error) {
      throw error;
    }
  };

  return wrapped;
};

const isCustomEndpoint =
  process.env.OPENAI_ENDPOINT &&
  process.env.OPENAI_ENDPOINT !== 'https://api.openai.com/v1';
const customModel = process.env.OPENAI_MODEL;

// Models
export const o3MiniModel = openai(
  isCustomEndpoint && customModel ? customModel : 'gpt-4o',
  {
    // reasoningEffort: 'medium',
    structuredOutputs: true,
  },
);

const MinChunkSize = 140;
const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(
  prompt: string,
  contextSize = Number(process.env.CONTEXT_SIZE) || 128_000,
) {
  if (!prompt) {
    return '';
  }

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) {
    return prompt;
  }

  const overflowTokens = length - contextSize;
  // on average it's 3 characters per token, so multiply by 3 to get a rough estimate of the number of characters
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) {
    return prompt.slice(0, MinChunkSize);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  // last catch, there's a chance that the trimmed prompt is same length as the original prompt, due to how tokens are split & innerworkings of the splitter, handle this case by just doing a hard cut
  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }

  // recursively trim until the prompt is within the context size
  return trimPrompt(trimmedPrompt, contextSize);
}
