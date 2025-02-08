/**
 * This file implements the main CLI interface for an AI-powered research system.
 * The system performs deep, recursive research on any topic by:
 * 1. Taking an initial query from the user
 * 2. Generating follow-up questions to better understand the research needs
 * 3. Using AI to generate multiple search queries based on the combined information
 * 4. Recursively exploring search results with configurable breadth and depth
 * 5. Generating a comprehensive markdown report of the findings
 */

import * as fs from 'fs/promises';
import * as readline from 'readline';

import { deepResearch, writeFinalReport } from './deep-research';
import { generateFeedback } from './feedback';

// Set up command line interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Helper function to prompt the user and get their input
 * @param query The question to ask the user
 * @returns A promise that resolves to the user's answer
 */
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

/**
 * Main execution function that orchestrates the research process:
 * 1. Collects initial query and research parameters from user
 * 2. Generates and asks follow-up questions to refine the research scope
 * 3. Performs deep research with configurable breadth (number of parallel searches)
 *    and depth (how many levels of follow-up research to pursue)
 * 4. Generates and saves a comprehensive markdown report
 */
async function run() {
  // Get the main research topic from the user
  const initialQuery = await askQuestion('What would you like to research? ');

  // Configure research parameters:
  // - breadth: controls how many parallel search queries to generate (2-10 recommended)
  // - depth: controls how many levels of follow-up research to pursue (1-5 recommended)
  const breadth =
    parseInt(
      await askQuestion(
        'Enter research breadth (recommended 2-10, default 4): ',
      ),
      10,
    ) || 4;
  const depth =
    parseInt(
      await askQuestion('Enter research depth (recommended 1-5, default 2): '),
      10,
    ) || 2;

  console.log(`Creating research plan...`);

  /**
   * generateFeedback() - Initial Research Refinement
   * Uses OpenAI to generate targeted follow-up questions based on the initial query.
   * These questions help clarify the research scope and gather additional context
   * that will guide the subsequent deep research process.
   */
  const followUpQuestions = await generateFeedback({
    query: initialQuery,
  });

  console.log(
    '\nTo better understand your research needs, please answer these follow-up questions:',
  );

  // Collect user's answers to the follow-up questions
  const answers: string[] = [];
  for (const question of followUpQuestions) {
    const answer = await askQuestion(`\n${question}\nYour answer: `);
    answers.push(answer);
  }

  // Combine initial query and Q&A into a comprehensive research prompt
  const combinedQuery = `
Initial Query: ${initialQuery}
Follow-up Questions and Answers:
${followUpQuestions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
`;

  console.log('\nResearching your topic...');

  /**
   * deepResearch() - Core Research Engine
   * 
   * A recursive research function that:
   * 1. Uses OpenAI to generate multiple search queries (generateSerpQueries)
   *    - Takes user query and previous learnings
   *    - Returns search queries with research goals
   * 
   * 2. For each query:
   *    - Uses Firecrawl API to search web content (max 5 results/query)
   *    - Rate limited to 2 concurrent requests
   *    - 15-second timeout per search
   * 
   * 3. Processes results (processSerpResult):
   *    - Uses OpenAI to extract key learnings
   *    - Generates follow-up questions
   *    - Manages content within token limits
   * 
   * 4. If depth > 0:
   *    - Generates new queries based on findings
   *    - Recursively continues research
   * 
   * Handles errors gracefully and deduplicates results
   */
  const { learnings, visitedUrls } = await deepResearch({
    query: combinedQuery,
    breadth,
    depth,
  });

  // Display the research results
  console.log(`\n\nLearnings:\n\n${learnings.join('\n')}`);
  console.log(
    `\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`,
  );
  console.log('Writing final report...');

  /**
   * writeFinalReport() - Research Synthesis
   * 
   * Uses OpenAI to create a comprehensive markdown report by:
   * 1. Taking the original research prompt
   * 2. Incorporating all accumulated learnings
   * 3. Processing content within token limits (150k max)
   * 4. Generating a structured markdown document
   * 5. Automatically appending source URLs as references
   */
  const report = await writeFinalReport({
    prompt: combinedQuery,
    learnings,
    visitedUrls,
  });

  // Save the report to a markdown file
  await fs.writeFile('output.md', report, 'utf-8');

  console.log(`\n\nFinal Report:\n\n${report}`);
  console.log('\nReport has been saved to output.md');
  rl.close();
}

// Start the research process and handle any errors
run().catch(console.error);
