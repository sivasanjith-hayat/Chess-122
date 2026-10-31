/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chess, Move } from 'chess.js';
import { evaluatePosition, PIECE_VALUES } from './eval';
import { analyzeMoveFacts } from './tags';
import { CandidateMove, HindsightAnalysis, SearchOptions, SearchResult } from './types';

interface TTEntry {
  depth: number;
  score: number;
  flag: 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';
  bestMoveSan?: string;
}

const MAX_TT_SIZE = 30000;
const transpositionTable = new Map<string, TTEntry>();

function getFenKey(chess: Chess): string {
  // Use the first 4 fields of FEN (board, turn, castling, ep) as hash key
  const fen = chess.fen();
  const idx = fen.lastIndexOf(' ');
  const idx2 = fen.lastIndexOf(' ', idx - 1);
  return idx2 > 0 ? fen.slice(0, idx2) : fen;
}

function mvvLvaScore(move: Move): number {
  let score = 0;
  if (move.captured) {
    score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  if (move.san.includes('+')) {
    score += 150;
  }
  return score;
}

/**
 * Quiescence search to avoid horizon effect on tactical captures/promotions.
 */
function quiescence(
  chess: Chess,
  alpha: number,
  beta: number,
  qDepth: number,
  stats: { nodes: number }
): number {
  stats.nodes++;
  const evalSign = chess.turn() === 'w' ? 1 : -1;
  const standPat = evaluatePosition(chess).total * evalSign;

  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;
  if (qDepth <= 0) return standPat;

  const moves = chess
    .moves({ verbose: true })
    .filter(
      (m) =>
        m.promotion ||
        (m.captured && PIECE_VALUES[m.captured] >= PIECE_VALUES[m.piece] - 120)
    );
  if (moves.length === 0) return standPat;

  moves.sort((a, b) => mvvLvaScore(b) - mvvLvaScore(a));

  for (const move of moves) {
    chess.move(move);
    const score = -quiescence(chess, -beta, -alpha, qDepth - 1, stats);
    chess.undo();

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

/**
 * Negamax with alpha-beta pruning, killer heuristic, MVV-LVA, and Transposition Table.
 */
function negamax(
  chess: Chess,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  killers: string[][],
  stats: { nodes: number; deadline: number; aborted: boolean }
): { score: number; pv: string[] } {
  stats.nodes++;

  if ((stats.nodes & 511) === 0 && performance.now() > stats.deadline) {
    stats.aborted = true;
    const evalSign = chess.turn() === 'w' ? 1 : -1;
    return { score: evaluatePosition(chess).total * evalSign, pv: [] };
  }

  if (chess.isCheckmate()) {
    // Prefer faster mates
    return { score: -90000 + ply * 10, pv: [] };
  }

  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return { score: 0, pv: [] };
  }

  if (depth <= 0) {
    const qScore = quiescence(chess, alpha, beta, 2, stats);
    return { score: qScore, pv: [] };
  }

  const alphaOrig = alpha;
  const key = getFenKey(chess);
  const ttEntry = transpositionTable.get(key);

  if (ttEntry && ttEntry.depth >= depth && ply > 0) {
    if (ttEntry.flag === 'EXACT') {
      return { score: ttEntry.score, pv: ttEntry.bestMoveSan ? [ttEntry.bestMoveSan] : [] };
    } else if (ttEntry.flag === 'LOWERBOUND') {
      alpha = Math.max(alpha, ttEntry.score);
    } else if (ttEntry.flag === 'UPPERBOUND') {
      beta = Math.min(beta, ttEntry.score);
    }
    if (alpha >= beta) {
      return { score: ttEntry.score, pv: ttEntry.bestMoveSan ? [ttEntry.bestMoveSan] : [] };
    }
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { score: 0, pv: [] };
  }

  const ttBestSan = ttEntry?.bestMoveSan;
  const plyKillers = killers[ply] || [];

  moves.sort((a, b) => {
    const aScore =
      (a.san === ttBestSan ? 20000 : 0) +
      mvvLvaScore(a) +
      (plyKillers.includes(a.san) ? 90 : 0);
    const bScore =
      (b.san === ttBestSan ? 20000 : 0) +
      mvvLvaScore(b) +
      (plyKillers.includes(b.san) ? 90 : 0);
    return bScore - aScore;
  });

  let bestScore = -Infinity;
  let bestPv: string[] = [];
  let bestMoveSan = moves[0].san;

  for (const move of moves) {
    chess.move(move);
    const child = negamax(chess, depth - 1, ply + 1, -beta, -alpha, killers, stats);
    const score = -child.score;
    chess.undo();

    if (stats.aborted) break;

    if (score > bestScore) {
      bestScore = score;
      bestMoveSan = move.san;
      bestPv = [move.san, ...child.pv.slice(0, 3)];
    }

    if (score > alpha) {
      alpha = score;
    }

    if (alpha >= beta) {
      if (!move.captured && killers[ply]) {
        if (!killers[ply].includes(move.san)) {
          killers[ply][1] = killers[ply][0];
          killers[ply][0] = move.san;
        }
      }
      break;
    }
  }

  if (!stats.aborted) {
    if (transpositionTable.size > MAX_TT_SIZE) {
      transpositionTable.clear();
    }
    let flag: TTEntry['flag'] = 'EXACT';
    if (bestScore <= alphaOrig) flag = 'UPPERBOUND';
    else if (bestScore >= beta) flag = 'LOWERBOUND';

    transpositionTable.set(key, {
      depth,
      score: bestScore,
      flag,
      bestMoveSan,
    });
  }

  return { score: bestScore, pv: bestPv };
}

/**
 * Runs iterative deepening negamax search from the root FEN and returns the TOP 4 candidate moves
 * with scores, principal variations (up to 4 plies), opponent refutations, and factual tags.
 */
export function searchRootPosition(
  fen: string,
  options: SearchOptions,
  onProgress?: (depth: number, currentBestSan: string, nodes: number) => void
): SearchResult {
  const startTime = performance.now();
  const maxTimeMs = options.maxTimeMs ?? 1200;
  const deadline = startTime + maxTimeMs;

  const chess = new Chess(fen);
  const rootColor = chess.turn();
  const rootSign = rootColor === 'w' ? 1 : -1;
  const rootEvalBreakdown = evaluatePosition(chess);

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) {
    throw new Error('No legal moves in position');
  }

  // Sort initial moves by MVV-LVA + central heuristics
  legalMoves.sort((a, b) => mvvLvaScore(b) - mvvLvaScore(a));

  const killers: string[][] = Array.from({ length: 16 }, () => []);
  const stats = { nodes: 0, deadline, aborted: false };

  let scoredMoves: {
    moveObj: Move;
    score: number;
    pv: string[];
  }[] = legalMoves.map((m) => ({
    moveObj: m,
    score: mvvLvaScore(m),
    pv: [m.san],
  }));

  let completedDepth = 1;
  const targetDepth = Math.max(1, Math.min(6, options.depth));

  for (let d = 1; d <= targetDepth; d++) {
    const nextScored: typeof scoredMoves = [];
    scoredMoves.sort((a, b) => b.score - a.score);

    for (const item of scoredMoves) {
      chess.move(item.moveObj);
      const child = negamax(chess, d - 1, 1, -100000, 100000, killers, stats);
      const score = -child.score;
      chess.undo();

      if (stats.aborted && d > 1) {
        break;
      }

      nextScored.push({
        moveObj: item.moveObj,
        score,
        pv: [item.moveObj.san, ...child.pv.slice(0, 3)],
      });
    }

    if (stats.aborted && d > 1) {
      break;
    }

    scoredMoves = nextScored;
    scoredMoves.sort((a, b) => b.score - a.score);
    completedDepth = d;

    if (onProgress && scoredMoves.length > 0) {
      onProgress(d, scoredMoves[0].moveObj.san, stats.nodes);
    }

    if (scoredMoves[0].score > 80000) {
      break;
    }
    if (performance.now() - startTime > maxTimeMs * 0.72 && d >= 2) {
      break;
    }
  }

  scoredMoves.sort((a, b) => b.score - a.score);
  const bestScore = scoredMoves[0].score;

  // Build top 4 candidates with factual tags, rejection reasons, and EvalBreakdown
  const topSlice = scoredMoves.slice(0, 4);
  const candidates: CandidateMove[] = topSlice.map((item, index) => {
    const scoreDiff = item.score - bestScore;
    const facts = analyzeMoveFacts(fen, item.moveObj, item.pv, scoreDiff);
    chess.move(item.moveObj);
    const eb = evaluatePosition(chess);
    chess.undo();

    let quality: CandidateMove['quality'] = 'fine';
    if (index === 0) quality = 'best';
    else if (scoreDiff <= -160) quality = 'blunder';
    else if (scoreDiff <= -60) quality = 'risky';
    else quality = 'fine';

    return {
      move: {
        from: item.moveObj.from,
        to: item.moveObj.to,
        promotion: item.moveObj.promotion,
      },
      san: item.moveObj.san,
      score: item.score,
      evalScoreWhite: item.score * rootSign,
      pv: item.pv,
      refutation: item.pv[1],
      tags: facts.tags,
      rejectionReason: facts.rejectionReason,
      evalBreakdown: eb,
      quality,
    };
  });

  const searchTimeMs = Math.round(performance.now() - startTime);

  return {
    bestMove: candidates[0],
    candidates,
    depthReached: completedDepth,
    nodesSearched: stats.nodes,
    searchTimeMs,
    evalBreakdown: rootEvalBreakdown,
  };
}

/**
 * Performs Hindsight Analysis after the human replies to the bot's previous move.
 * Re-searches the new position 2 plies deeper than the bot's original remaining horizon
 * and compares the score from the bot's perspective against what the bot predicted.
 */
export function computeHindsightAnalysis(params: {
  fenAfterHumanReply: string;
  botColor: 'w' | 'b';
  botOriginalDepth: number;
  botMoveSan: string;
  botPredictedEvalFromBotPerspective: number; // centipawns
  botPredictedHumanReplySan?: string;
  humanActualMoveSan: string;
  botRunnerUps: CandidateMove[];
}): HindsightAnalysis {
  const {
    fenAfterHumanReply,
    botColor,
    botOriginalDepth,
    botMoveSan,
    botPredictedEvalFromBotPerspective,
    botPredictedHumanReplySan,
    humanActualMoveSan,
    botRunnerUps,
  } = params;

  const chess = new Chess(fenAfterHumanReply);
  if (chess.isGameOver()) {
    const eb = evaluatePosition(chess);
    const botSign = botColor === 'w' ? 1 : -1;
    const actualEval = eb.total * botSign;
    return {
      type: 'VINDICATED',
      evalDifference: actualEval - botPredictedEvalFromBotPerspective,
      predictedEval: botPredictedEvalFromBotPerspective,
      actualEval,
      humanMoveSan: humanActualMoveSan,
      botMoveSan,
      explanation: `Game concluded immediately after ${humanActualMoveSan}.`,
    };
  }

  // Re-search 2 plies deeper relative to the post-reply position
  // (Original search evaluated this node at depth = botOriginalDepth - 2; searching at botOriginalDepth gives a +2 ply deeper horizon!)
  const deeperDepth = Math.min(4, Math.max(2, botOriginalDepth));
  const deeperSearch = searchRootPosition(fenAfterHumanReply, {
    depth: deeperDepth,
    maxTimeMs: 300,
  });

  // `deeperSearch.bestMove.score` is from the side to move (the bot's perspective, since human just moved!)
  const actualEval = Math.max(-2500, Math.min(2500, deeperSearch.bestMove.score));
  const predictedEval = Math.max(-2500, Math.min(2500, botPredictedEvalFromBotPerspective));
  const evalDiff = actualEval - predictedEval; // positive = bot is happier than predicted; negative = bot's eval dropped

  // Classify according to specification:
  // 1. VINDICATED: human played the bot's predicted line (and eval didn't crash by 70+ cp)
  // 2. REGRET: eval dropped by 70+ centipawns vs what the bot predicted
  // 3. GIFT: human blundered by 150+ centipawns (so bot's eval jumped by +150+ cp)
  // 4. SHRUG: nothing notable
  if (evalDiff <= -70) {
    const alt = botRunnerUps.find((c) => c.san !== botMoveSan) || botRunnerUps[0];
    const betterMoveSan = alt ? alt.san : botMoveSan;
    const betterMoveReason = alt && alt.tags[0] ? alt.tags[0].toLowerCase() : 'held a firmer line';

    return {
      type: 'REGRET',
      evalDifference: evalDiff,
      predictedEval,
      actualEval,
      humanMoveSan: humanActualMoveSan,
      botMoveSan,
      betterMoveSan,
      betterMoveReason,
      explanation: `My eval dropped ${Math.abs(Math.round(evalDiff))} cp after your ${humanActualMoveSan}. I should have played ${betterMoveSan} (${betterMoveReason}).`,
    };
  }

  if (evalDiff >= 150) {
    const punishSan = deeperSearch.bestMove.san;
    const punishFact = deeperSearch.bestMove.tags[0] || 'seizes the advantage';
    return {
      type: 'GIFT',
      evalDifference: evalDiff,
      predictedEval,
      actualEval,
      humanMoveSan: humanActualMoveSan,
      botMoveSan,
      betterMoveSan: punishSan,
      betterMoveReason: punishFact,
      explanation: `Your ${humanActualMoveSan} gifted me +${Math.round(evalDiff)} cp! You missed ${botPredictedHumanReplySan || 'a tighter defense'}, allowing ${punishSan} (${punishFact.toLowerCase()}).`,
    };
  }

  if (botPredictedHumanReplySan && humanActualMoveSan === botPredictedHumanReplySan) {
    return {
      type: 'VINDICATED',
      evalDifference: evalDiff,
      predictedEval,
      actualEval,
      humanMoveSan: humanActualMoveSan,
      botMoveSan,
      explanation: `You played ${humanActualMoveSan} right into my principal variation (${(actualEval / 100).toFixed(2)} pawns).`,
    };
  }

  return {
    type: 'SHRUG',
    evalDifference: evalDiff,
    predictedEval,
    actualEval,
    humanMoveSan: humanActualMoveSan,
    botMoveSan,
    explanation: `Your ${humanActualMoveSan} shifted the evaluation by ${evalDiff >= 0 ? '+' : ''}${Math.round(evalDiff)} cp—within my expected margin.`,
  };
}
