import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { o3MiniModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';

/**
 * Represents the final result of a deep research operation.
 * @typedef {Object} ResearchResult
 * @property {string[]} learnings - Array of insights and information gathered during research
 * @property {string[]} visitedUrls - List of all URLs that were crawled during the research
 */
type ResearchResult = {
  learnings: string[];
  visitedUrls: string[];
};

// Concurrency control for API rate limiting
// increase this if you have higher API rate limits
const ConcurrencyLimit = 1;

/**
 * Initialize Firecrawl client for web searching and content scraping
 * Can be configured with custom API key and base URL through environment variables
 */
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

/**
 * Generates optimized search engine queries based on a user's research topic.
 * This function uses AI to create targeted search queries that will help gather comprehensive information.
 * 
 * @param {Object} params - The parameters for query generation
 * @param {string} params.query - The user's original research question or topic
 * @param {number} [params.numQueries=3] - Maximum number of search queries to generate
 * @param {string[]} [params.learnings] - Previous research findings to inform new query generation
 * 
 * @returns {Promise<Array<{query: string, researchGoal: string}>>} Array of generated queries and their research objectives
 * Each query object contains:
 * - query: The actual search string to be used
 * - researchGoal: Detailed explanation of what information this query aims to find and future research directions
 */
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
}) {
  // Use AI to generate optimized search queries based on the input query and previous learnings
  const res = await generateObject({
    // Use the o3MiniModel for query generation
    model: o3MiniModel,
    // Set the system prompt for context
    system: systemPrompt(),
    // Construct the prompt, incorporating the query and any previous learnings
    prompt: `Given the following prompt from the user, generate a list of SERP queries to research the topic. Return a maximum of ${numQueries} queries, but feel free to return less if the original prompt is clear. Make sure each query is unique and not similar to each other: <prompt>${query}</prompt>\n\n${
      learnings
        ? `Here are some learnings from previous research, use them to generate more specific queries: ${learnings.join(
            '\n',
          )}`
        : ''
    }`,
    // Define the expected response schema using Zod
    schema: z.object({
      // Array of query objects, each containing a search query and research goal
      queries: z
        .array(
          z.object({
            // The actual search query string
            query: z.string().describe('The SERP query'),
            // Detailed description of the query's purpose and future research directions
            researchGoal: z
              .string()
              .describe(
                'First talk about the goal of the research that this query is meant to accomplish, then go deeper into how to advance the research once the results are found, mention additional research directions. Be as specific as possible, especially for additional research directions.',
              ),
          }),
        )
        .describe(`List of SERP queries, max of ${numQueries}`),
    }),
  });

  // Log the generated queries for debugging
  console.log(
    `Created ${res.object.queries.length} queries`,
    res.object.queries,
  );

  // Return the queries, ensuring we don't exceed the requested number
  return res.object.queries.slice(0, numQueries);
}

/**
 * Processes and analyzes the results from a search engine query.
 * This function takes raw search results, extracts meaningful information, and generates both
 * concrete learnings and follow-up questions for deeper research.
 * 
 * @param {Object} params - Parameters for processing search results
 * @param {string} params.query - The search query that generated these results
 * @param {SearchResponse} params.result - Raw search results from Firecrawl
 * @param {number} [params.numLearnings=3] - Maximum number of key learnings to extract
 * @param {number} [params.numFollowUpQuestions=3] - Maximum number of follow-up questions to generate
 * 
 * @returns {Promise<{learnings: string[], followUpQuestions: string[]}>} Processed results containing:
 * - learnings: Key insights extracted from the search results
 * - followUpQuestions: Generated questions for further research
 */
async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}) {
  // Extract markdown content from search results, remove nulls/undefined, and trim each to 25k tokens
  const contents = compact(result.data.map(item => item.markdown)).map(
    content => trimPrompt(content, 25_000),
  );
  console.log(`Ran ${query}, found ${contents.length} contents`);

  // Generate learnings and follow-up questions using AI model
  const res = await generateObject({
    model: o3MiniModel,
    // Set 60 second timeout for the AI call
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    // Construct prompt asking AI to analyze search results and extract key learnings
    prompt: `Given the following contents from a SERP search for the query <query>${query}</query>, generate a list of learnings from the contents. Return a maximum of ${numLearnings} learnings, but feel free to return less if the contents are clear. Make sure each learning is unique and not similar to each other. The learnings should be concise and to the point, as detailed and infromation dense as possible. Make sure to include any entities like people, places, companies, products, things, etc in the learnings, as well as any exact metrics, numbers, or dates. The learnings will be used to research the topic further.\n\n<contents>${contents
      .map(content => `<content>\n${content}\n</content>`)
      .join('\n')}</contents>`,
    // Define schema for AI response with learnings and follow-up questions
    schema: z.object({
      learnings: z
        .array(z.string())
        .describe(`List of learnings, max of ${numLearnings}`),
      followUpQuestions: z
        .array(z.string())
        .describe(
          `List of follow-up questions to research the topic further, max of ${numFollowUpQuestions}`,
        ),
    }),
  });
  console.log(
    `Created ${res.object.learnings.length} learnings`,
    res.object.learnings,
  );

  // Return the generated learnings and follow-up questions
  return res.object;
}

/**
 * Generates a comprehensive final report based on all research findings.
 * Takes all accumulated learnings and visited URLs and creates a well-structured
 * markdown document that synthesizes the information into a coherent narrative.
 * 
 * @param {Object} params - Parameters for report generation
 * @param {string} params.prompt - The original research question/topic
 * @param {string[]} params.learnings - All insights gathered during research
 * @param {string[]} params.visitedUrls - All sources consulted during research
 * 
 * @returns {Promise<string>} A markdown-formatted report including:
 * - Detailed analysis of the topic
 * - Synthesis of all learnings
 * - List of all sources consulted
 */
export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
}) {
  const learningsString = trimPrompt(
    learnings
      .map(learning => `<learning>\n${learning}\n</learning>`)
      .join('\n'),
    150_000,
  );

  const res = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Given the following prompt from the user, write a final report on the topic using the learnings from research. Make it as as detailed as possible, aim for 3 or more pages, include ALL the learnings from research:\n\n<prompt>${prompt}</prompt>\n\nHere are all the learnings from previous research:\n\n<learnings>\n${learningsString}\n</learnings>`,
    schema: z.object({
      reportMarkdown: z
        .string()
        .describe('Final report on the topic in Markdown'),
    }),
  });

  // Append the visited URLs section to the report
  const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
  return res.object.reportMarkdown + urlsSection;
}

/**
 * Main research function that performs a deep, recursive investigation of a topic.
 * This function implements a breadth-first search strategy where:
 * - It generates multiple search queries for the topic
 * - For each query, it searches and extracts information
 * - Based on findings, it generates follow-up questions
 * - It then recursively researches these follow-up questions up to the specified depth
 * 
 * @param {Object} params - Parameters controlling the research process
 * @param {string} params.query - The research topic or question to investigate
 * @param {number} params.breadth - Number of parallel search queries to generate at each level
 * @param {number} params.depth - How many levels deep to pursue the research
 * @param {string[]} [params.learnings=[]] - Accumulated learnings from previous research iterations
 * @param {string[]} [params.visitedUrls=[]] - URLs already consulted in previous iterations
 * 
 * @returns {Promise<ResearchResult>} Final research results containing:
 * - All unique learnings gathered across all iterations
 * - All unique URLs consulted during the research
 * 
 * The function handles errors gracefully, particularly timeout issues, and implements
 * rate limiting to respect API constraints. It automatically reduces the breadth
 * of search as it goes deeper to prevent exponential growth of queries.
 */
export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
}): Promise<ResearchResult> {
  // Generate multiple search queries based on the input query and previous learnings
  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });

  // Create a rate limiter to prevent too many concurrent requests
  const limit = pLimit(ConcurrencyLimit);

  // Run concurrent searches for each generated query, but with rate limiting
  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          // Search the web using Firecrawl API
          // - Timeout after 15 seconds
          // - Get up to 5 results per query
          // - Convert results to markdown format
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Extract URLs from search results
          const newUrls = compact(result.data.map(item => item.url));

          // Reduce breadth for next iteration to prevent exponential growth
          const newBreadth = Math.ceil(breadth / 2);
          // Decrease depth counter for recursion
          const newDepth = depth - 1;

          // Process search results to extract key learnings and generate follow-up questions
          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });

          // Combine new findings with previous results
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          // If we haven't reached maximum depth, continue researching
          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            // Create next query combining previous goal and follow-up questions
            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            // Recursively research the follow-up questions
            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          } else {
            // At maximum depth, return accumulated findings
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e: any) {
          // Handle errors gracefully, particularly timeouts
          if (e.message && e.message.includes('Timeout')) {
            console.error(
              `Timeout error running query: ${serpQuery.query}: `,
              e,
            );
          } else {
            console.error(`Error running query: ${serpQuery.query}: `, e);
          }
          // Return empty results on error to allow other queries to continue
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      }),
    ),
  );

  // Combine all results and remove duplicates
  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}
