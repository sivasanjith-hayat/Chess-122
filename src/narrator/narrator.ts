/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BotMood,
  CandidateMove,
  EvalBreakdown,
  HindsightAnalysis,
  SearchResult,
} from '../engine/types';
import {
  EXPECTED_TEMPLATES,
  HINDSIGHT_TEMPLATES,
  HindsightTemplateVars,
  MOVE_TEMPLATES_BY_MOOD,
  MoveTemplateVars,
} from './templates';

export interface RunnerUpEntry {
  san: string;
  move: { from: string; to: string; promotion?: string };
  evalPawns: string;
  scoreCp: number;
  pv: string[];
  refutation?: string;
  tags: string[];
  rejectionLine: string; // e.g. "Nxd5? You answer exd5 and win my knight"
  quality: CandidateMove['quality'];
}

export interface RegretCard {
  id: string;
  turnNumber: number;
  fenBeforeBotMove: string;
  fenAfterBotMove: string;
  botColor: 'w' | 'b';
  moveSan: string;
  moveCoords: { from: string; to: string; promotion?: string };
  evalPawnsFromBot: number; // e.g. +1.25 from bot perspective
  evalScoreWhiteCp: number;
  evalBreakdown: EvalBreakdown;
  depthReached: number;
  nodesSearched: number;
  searchTimeMs: number;
  theMoveText: string;
  iExpectedText: string;
  predictedReplySan?: string;
  pv: string[];
  almostPlayed: RunnerUpEntry[];
  hindsight?: HindsightAnalysis & { narrativeText: string };
  confidence: number; // 0-100
  mood: BotMood;
}

export function computeConfidenceAndMood(
  evalCpFromBotPerspective: number,
  evalSwingCp = 0
): { confidence: number; mood: BotMood } {
  // Base confidence on bot evaluation: 0 cp = 55, +300 cp = 90, -300 cp = 15
  const raw = 55 + evalCpFromBotPerspective * 0.12 + evalSwingCp * 0.08;
  const confidence = Math.max(0, Math.min(100, Math.round(raw)));

  let mood: BotMood = 'calm';
  if (confidence >= 72) mood = 'confident';
  else if (confidence >= 45) mood = 'calm';
  else if (confidence >= 24) mood = 'nervous';
  else mood = 'panicking';

  return { confidence, mood };
}

export class NarratorEngine {
  private usedMoveIdx: Record<BotMood, Set<number>> = {
    confident: new Set(),
    calm: new Set(),
    nervous: new Set(),
    panicking: new Set(),
  };
  private usedExpectedIdx = new Set<number>();
  private usedHindsightIdx: Record<string, Set<number>> = {
    REGRET: new Set(),
    GIFT: new Set(),
    VINDICATED: new Set(),
    SHRUG: new Set(),
  };
  private seedCounter = 0;

  public resetGame() {
    this.usedMoveIdx.confident.clear();
    this.usedMoveIdx.calm.clear();
    this.usedMoveIdx.nervous.clear();
    this.usedMoveIdx.panicking.clear();
    this.usedExpectedIdx.clear();
    this.usedHindsightIdx.REGRET.clear();
    this.usedHindsightIdx.GIFT.clear();
    this.usedHindsightIdx.VINDICATED.clear();
    this.usedHindsightIdx.SHRUG.clear();
    this.seedCounter = 0;
  }

  private pickTemplate<T>(list: ((v: T) => string)[], usedSet: Set<number>): (v: T) => string {
    if (usedSet.size >= list.length) {
      usedSet.clear();
    }
    let idx = this.seedCounter % list.length;
    while (usedSet.has(idx)) {
      idx = (idx + 1) % list.length;
    }
    this.seedCounter += 3;
    usedSet.add(idx);
    return list[idx];
  }

  public createRegretCard(params: {
    id: string;
    turnNumber: number;
    fenBeforeBotMove: string;
    fenAfterBotMove: string;
    botColor: 'w' | 'b';
    searchResult: SearchResult;
    previousBotEvalCp?: number;
  }): RegretCard {
    const {
      id,
      turnNumber,
      fenBeforeBotMove,
      fenAfterBotMove,
      botColor,
      searchResult,
      previousBotEvalCp,
    } = params;

    const best = searchResult.bestMove;
    const clampedScoreCp = Math.max(-2500, Math.min(2500, best.score));
    const evalPawnsNum = Number((clampedScoreCp / 100).toFixed(2));
    const evalPawnsStr = `${evalPawnsNum >= 0 ? '+' : ''}${evalPawnsNum.toFixed(2)}`;

    const swingCp = previousBotEvalCp !== undefined ? clampedScoreCp - previousBotEvalCp : 0;
    const { confidence, mood } = computeConfidenceAndMood(clampedScoreCp, swingCp);

    const primaryReason = best.tags[0] || `develops to ${best.move.to}`;
    const replySan = best.pv[1] || 'any quiet reply';
    const pvLine = best.pv.join(' ');

    const moveVars: MoveTemplateVars = {
      moveSan: best.san,
      reason: primaryReason,
      evalPawns: evalPawnsStr,
      replySan,
      pvLine,
    };

    const moveTpl = this.pickTemplate(MOVE_TEMPLATES_BY_MOOD[mood], this.usedMoveIdx[mood]);
    const expectedTpl = this.pickTemplate(EXPECTED_TEMPLATES, this.usedExpectedIdx);

    const almostPlayed: RunnerUpEntry[] = searchResult.candidates.slice(1, 4).map((cand) => {
      const cScore = Math.max(-2500, Math.min(2500, cand.score));
      const cPawns = (cScore / 100).toFixed(2);
      const cPawnsStr = `${cScore >= 0 ? '+' : ''}${cPawns}`;
      return {
        san: cand.san,
        move: cand.move,
        evalPawns: cPawnsStr,
        scoreCp: cScore,
        pv: cand.pv,
        refutation: cand.refutation,
        tags: cand.tags,
        rejectionLine: `${cand.san}? ${cand.rejectionReason}.`,
        quality: cand.quality,
      };
    });

    return {
      id,
      turnNumber,
      fenBeforeBotMove,
      fenAfterBotMove,
      botColor,
      moveSan: best.san,
      moveCoords: best.move,
      evalPawnsFromBot: evalPawnsNum,
      evalScoreWhiteCp: best.evalScoreWhite,
      evalBreakdown: best.evalBreakdown,
      depthReached: searchResult.depthReached,
      nodesSearched: searchResult.nodesSearched,
      searchTimeMs: searchResult.searchTimeMs,
      theMoveText: moveTpl(moveVars),
      iExpectedText: expectedTpl(moveVars),
      predictedReplySan: best.pv[1],
      pv: best.pv,
      almostPlayed,
      confidence,
      mood,
    };
  }

  public attachHindsight(card: RegretCard, hindsight: HindsightAnalysis): RegretCard {
    const usedSet = this.usedHindsightIdx[hindsight.type] || new Set<number>();
    const tpl = this.pickTemplate(HINDSIGHT_TEMPLATES[hindsight.type], usedSet);

    const absPawns = (Math.abs(hindsight.evalDifference) / 100).toFixed(2);
    const vars: HindsightTemplateVars = {
      humanMoveSan: hindsight.humanMoveSan,
      botMoveSan: card.moveSan,
      betterMoveSan: hindsight.betterMoveSan || card.moveSan,
      betterReason: hindsight.betterMoveReason || 'kept the balance',
      evalDropPawns: absPawns,
      evalGainPawns: absPawns,
      predictedReplySan: card.predictedReplySan || 'the main line',
    };

    const narrativeText = tpl(vars);
    const updatedMood = computeConfidenceAndMood(hindsight.actualEval, hindsight.evalDifference);

    return {
      ...card,
      confidence: updatedMood.confidence,
      mood: updatedMood.mood,
      hindsight: {
        ...hindsight,
        narrativeText,
      },
    };
  }
}
