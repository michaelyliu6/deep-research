# Deep Research Enhancement Plan

## Overview
This document outlines the implementation plan for two major enhancements to the Deep Research project:
1. Research Quality Metrics & Source Validation
2. Interactive Research Refinement

## 1. Research Quality Metrics & Source Validation

### Phase 1: Source Metadata Infrastructure
1. Create new types and interfaces:
```typescript
// src/types/source.ts
interface SourceMetadata {
  url: string;
  domain: string;
  publishDate?: Date;
  author?: string;
  domainAuthority?: number;
  contentType: 'article' | 'academic' | 'news' | 'blog' | 'other';
  lastUpdated?: Date;
}

interface SourceScore {
  credibilityScore: number;  // 0-100
  recencyScore: number;      // 0-100
  relevanceScore: number;    // 0-100
  overallScore: number;      // weighted average
  confidenceLevel: 'high' | 'medium' | 'low';
}
```

2. Implement metadata extraction:
```typescript
// src/utils/metadata.ts
class MetadataExtractor {
  async extractFromUrl(url: string): Promise<SourceMetadata>;
  async extractFromContent(content: string): Promise<Partial<SourceMetadata>>;
  private extractPublishDate(content: string): Date | undefined;
  private extractAuthor(content: string): string | undefined;
  private determineContentType(url: string, content: string): ContentType;
}
```

3. Add domain authority checking:
- Integrate with domain authority APIs (e.g., Moz, Ahrefs, or custom solution)
- Implement caching for domain authority scores
- Create fallback mechanisms for when API calls fail

### Phase 2: Source Scoring System
1. Implement the scoring algorithm:
```typescript
// src/scoring/sourceScoring.ts
class SourceScorer {
  calculateCredibilityScore(metadata: SourceMetadata): number;
  calculateRecencyScore(publishDate: Date): number;
  calculateRelevanceScore(content: string, query: string): number;
  calculateOverallScore(scores: Partial<SourceScore>): number;
  determineConfidenceLevel(score: number): ConfidenceLevel;
}
```

2. Create weighting configuration:
```typescript
// src/config/scoring.ts
export const scoringWeights = {
  credibility: 0.4,
  recency: 0.3,
  relevance: 0.3,
  // Adjustable weights for different research modes
  academic: { credibility: 0.5, recency: 0.2, relevance: 0.3 },
  news: { credibility: 0.3, recency: 0.5, relevance: 0.2 },
}
```

### Phase 3: Integration with Research Process
1. Modify the `processSerpResult` function:
```typescript
// src/deep-research.ts
async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
  sourceScoring = true,
}) {
  // Add metadata extraction and scoring
  const sourceMetadata = await Promise.all(
    result.data.map(item => extractMetadata(item))
  );
  const sourceScores = sourceMetadata.map(metadata => 
    calculateSourceScore(metadata, query)
  );
  
  // Weight findings based on source scores
  const weightedContents = contents.map((content, i) => ({
    content,
    weight: sourceScores[i].overallScore
  }));
}
```

2. Enhance the research output:
```typescript
// src/types/research.ts
interface EnhancedResearchResult extends ResearchResult {
  sourceMetrics: {
    averageCredibility: number;
    averageRecency: number;
    sourceDiversity: number;
    confidenceLevels: {
      high: number;
      medium: number;
      low: number;
    };
  };
  findings: Array<{
    learning: string;
    sourceScore: SourceScore;
    confidence: number;
  }>;
}
```

## 2. Interactive Research Refinement

### Phase 1: User Interaction Infrastructure
1. Create interaction types:
```typescript
// src/types/interaction.ts
interface ResearchCheckpoint {
  stage: 'query-generation' | 'result-processing' | 'direction-selection';
  currentFindings: Finding[];
  proposedDirections: string[];
  userFeedback?: UserFeedback;
}

interface UserFeedback {
  approvedDirections: string[];
  rejectedDirections: string[];
  prioritizedSources: string[];
  excludedSources: string[];
  customNotes: string;
}
```

2. Implement checkpoint manager:
```typescript
// src/interaction/checkpointManager.ts
class ResearchCheckpointManager {
  async createCheckpoint(stage: string, data: any): Promise<ResearchCheckpoint>;
  async processUserFeedback(checkpoint: ResearchCheckpoint, feedback: UserFeedback): Promise<void>;
  async shouldPauseForFeedback(stage: string, context: any): Promise<boolean>;
}
```

### Phase 2: CLI Enhancement
1. Enhance the CLI interface:
```typescript
// src/cli/interactive.ts
class InteractiveResearchCLI {
  async presentCheckpoint(checkpoint: ResearchCheckpoint): Promise<void>;
  async collectUserFeedback(): Promise<UserFeedback>;
  async displayProgress(progress: ResearchProgress): Promise<void>;
  private formatCheckpointDisplay(checkpoint: ResearchCheckpoint): string;
  private handleUserCommands(input: string): Promise<void>;
}
```

2. Add interactive commands:
```typescript
// src/cli/commands.ts
const interactiveCommands = {
  '/help': showHelp,
  '/pause': pauseResearch,
  '/resume': resumeResearch,
  '/prioritize': prioritizeDirection,
  '/exclude': excludeSource,
  '/note': addNote,
  '/status': showStatus,
}
```

### Phase 3: Research Process Integration
1. Modify the main research loop:
```typescript
// src/deep-research.ts
async function deepResearch({
  query,
  breadth,
  depth,
  interactive = true,
  checkpointManager,
  cli,
}) {
  // Initialize interactive components
  const manager = checkpointManager || new ResearchCheckpointManager();
  const interface = cli || new InteractiveResearchCLI();
  
  // Modified research loop with checkpoints
  for (const stage of researchStages) {
    const checkpoint = await manager.createCheckpoint(stage, currentContext);
    
    if (await manager.shouldPauseForFeedback(stage, currentContext)) {
      await interface.presentCheckpoint(checkpoint);
      const feedback = await interface.collectUserFeedback();
      await manager.processUserFeedback(checkpoint, feedback);
    }
    
    // Adjust research direction based on feedback
    currentContext = await adjustResearchDirection(currentContext, feedback);
  }
}
```

2. Implement research direction adjustment:
```typescript
// src/research/direction.ts
async function adjustResearchDirection(
  context: ResearchContext,
  feedback: UserFeedback
): Promise<ResearchContext> {
  // Modify search queries based on feedback
  // Adjust source priorities
  // Update research goals
  return modifiedContext;
}
```

## Implementation Timeline

### Week 1-2: Research Quality Metrics
- Day 1-3: Source Metadata Infrastructure
- Day 4-7: Source Scoring System
- Day 8-10: Integration with Research Process
- Day 11-14: Testing and Refinement

### Week 3-4: Interactive Research Refinement
- Day 1-3: User Interaction Infrastructure
- Day 4-7: CLI Enhancement
- Day 8-10: Research Process Integration
- Day 11-14: Testing and Refinement

## Testing Strategy

1. Unit Tests:
- Source metadata extraction
- Scoring algorithms
- Checkpoint management
- CLI commands

2. Integration Tests:
- End-to-end research process
- Interactive feedback loop
- Source scoring integration

3. User Testing:
- CLI usability
- Research quality improvement
- Interactive feature effectiveness

## Success Metrics

1. Quality Metrics:
- Average source credibility score
- Source diversity index
- Finding confidence levels
- User satisfaction with results

2. Interactive Features:
- User engagement rate
- Feedback incorporation accuracy
- Research direction adjustments
- Session completion rate

## Future Considerations

1. Potential Extensions:
- Web interface for interaction
- API for programmatic access
- Additional source scoring factors
- Machine learning for source evaluation

2. Performance Optimization:
- Caching strategies
- Parallel processing
- API call optimization
- Memory usage optimization 