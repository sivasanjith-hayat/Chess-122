/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EvalBreakdown {
  material: number;
  position: number;
  mobility: number;
  kingSafety: number;
  pawns: number;
  total: number; // in centipawns (positive = White advantage)
}

export interface CandidateMove {
  move: {
    from: string;
    to: string;
    promotion?: string;
  };
  san: string;
  score: number; // in centipawns from the perspective of the moving side
  evalScoreWhite: number; // in centipawns from White's perspective
  pv: string[]; // principal variation SAN moves
  refutation?: string; // best opponent counter-move SAN
  tags: string[]; // e.g. "Captures Knight", "Forks King and Rook", "Hangs Bishop"
  rejectionReason: string; // One-line factual rejection reason for runner-ups
  evalBreakdown: EvalBreakdown;
  quality: 'best' | 'fine' | 'risky' | 'blunder';
}

export interface SearchResult {
  bestMove: CandidateMove;
  candidates: CandidateMove[]; // Top 4 candidate moves (or fewer if legal moves < 4)
  depthReached: number;
  nodesSearched: number;
  searchTimeMs: number;
  evalBreakdown: EvalBreakdown;
}

export type HindsightType = 'REGRET' | 'GIFT' | 'VINDICATED' | 'SHRUG';

export interface HindsightAnalysis {
  type: HindsightType;
  evalDifference: number; // centipawns difference vs predicted from bot perspective
  predictedEval: number;
  actualEval: number;
  humanMoveSan: string;
  botMoveSan: string;
  betterMoveSan?: string;
  betterMoveReason?: string;
  explanation: string;
}

export type BotMood = 'confident' | 'calm' | 'nervous' | 'panicking';

export interface BotState {
  confidence: number; // 0 to 100
  mood: BotMood;
  lastRegret?: HindsightAnalysis;
}

export interface SearchOptions {
  depth: number;
  maxTimeMs?: number;
}
