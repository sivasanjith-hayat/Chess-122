/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Flame,
  Gift,
  HelpCircle,
  History,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BotMood } from '../engine/types';
import { ThinkingStatus } from '../engine/workerClient';
import { RegretCard, RunnerUpEntry } from '../narrator/narrator';

export interface RewindState {
  cardId: string;
  runnerUp: RunnerUpEntry;
  baseFen: string;
  stepIndex: number; // 0 = runnerUp played, 1 = refutation played, etc.
  fens: string[];
}

interface RegretJournalProps {
  cards: RegretCard[];
  activeCardId: string | null;
  thinking: ThinkingStatus;
  botMood: BotMood;
  botConfidence: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectCardWhy: (card: RegretCard) => void;
  onSpeakCard: (card: RegretCard) => void;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
  onStartWhatIf: (card: RegretCard, runnerUp: RunnerUpEntry) => void;
  rewindState: RewindState | null;
  onStepRewind: (nextStep: number) => void;
  onExitRewind: () => void;
}

const MOOD_LABELS: Record<BotMood, { label: string; colorClass: string; desc: string }> = {
  confident: {
    label: 'CONFIDENT',
    colorClass: 'text-amber-300',
    desc: 'Warm studio glow · Smug precision',
  },
  calm: {
    label: 'COMPOSED',
    colorClass: 'text-sky-300',
    desc: 'Balanced calculation · Steady horizon',
  },
  nervous: {
    label: 'SWEATING',
    colorClass: 'text-cyan-300',
    desc: 'Cold flickering light · Defensive scramble',
  },
  panicking: {
    label: 'PANICKING',
    colorClass: 'text-rose-400',
    desc: 'Crimson alarm rim · Survival mode',
  },
};

export const RegretJournal: React.FC<RegretJournalProps> = ({
  cards,
  activeCardId,
  thinking,
  botMood,
  botConfidence,
  isCollapsed,
  onToggleCollapse,
  onSelectCardWhy,
  onSpeakCard,
  isSpeaking,
  onStopSpeaking,
  onStartWhatIf,
  rewindState,
  onStepRewind,
  onExitRewind,
}) => {
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null);
  const moodInfo = MOOD_LABELS[botMood];

  return (
    <aside
      aria-label="Bot Regret Journal"
      className={`fixed z-20 pointer-events-auto transition-transform duration-200 ease-out
        bottom-0 left-0 right-0 md:top-24 md:bottom-4 md:left-auto md:right-4 md:w-[410px]
        flex flex-col bg-[#0d121d]/96 border border-slate-700/80 md:rounded-xl shadow-2xl
        ${isCollapsed ? 'translate-y-[calc(100%-48px)] md:translate-y-0 md:translate-x-[365px]' : 'translate-y-0 md:translate-x-0'}
      `}
      style={{ maxHeight: isCollapsed ? '48px' : undefined }}
    >
      {/* Journal Header & Collapse Toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-bold tracking-wide text-[#e2c778] whitespace-nowrap">
            REGRET JOURNAL
          </span>
          <span className="text-xs text-slate-400 aria-hidden">·</span>
          <span className="text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap">
            {cards.length} {cards.length === 1 ? 'Turn' : 'Turns'}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand Regret Journal' : 'Collapse Regret Journal'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>{isCollapsed ? 'Show Journal' : 'Hide'}</span>
          {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* 5. MOOD METER (Confidence 0-100) + Live Thinking Stream */}
          <div className="px-4 py-3 bg-[#111827] border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">BOT MOOD:</span>
                <span className={`font-bold tracking-wide ${moodInfo.colorClass}`}>
                  {moodInfo.label}
                </span>
              </div>
              <div className="font-mono tabular-nums text-xs text-slate-200">
                Confidence <span className="font-bold text-[#e2c778]">{botConfidence}</span>/100
              </div>
            </div>

            {/* Confidence Bar */}
            <div
              className="w-full h-2 bg-slate-800 rounded-sm overflow-hidden mb-1.5"
              role="progressbar"
              aria-valuenow={botConfidence}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Bot Confidence Meter"
            >
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${botConfidence}%`,
                  backgroundColor:
                    botMood === 'confident'
                      ? '#f59e0b'
                      : botMood === 'calm'
                      ? '#38bdf8'
                      : botMood === 'nervous'
                      ? '#06b6d4'
                      : '#f43f5e',
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{moodInfo.desc}</span>
              {thinking.isThinking ? (
                <span className="font-mono tabular-nums text-amber-300 font-medium">
                  Thinking d{thinking.depth}: {thinking.currentBestSan} ({thinking.nodes}n)
                </span>
              ) : isSpeaking ? (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-semibold cursor-pointer"
                >
                  <Volume2 className="w-3 h-3 animate-pulse" />
                  <span>Speaking (Stop)</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Active "What If?" Rewind Control Banner */}
          {rewindState && (
            <div
              className="px-4 py-3 bg-indigo-950/90 border-b border-indigo-500/40 shrink-0"
              role="region"
              aria-label="What-If Alternate Line Explorer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-300" />
                  WHAT IF I PLAYED {rewindState.runnerUp.san}?
                </span>
                <button
                  type="button"
                  onClick={onExitRewind}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  Return to Live Game
                </button>
              </div>
              <p className="text-xs text-indigo-100 mb-2">
                {rewindState.runnerUp.rejectionLine}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {rewindState.runnerUp.pv.map((san, idx) => {
                  const active = rewindState.stepIndex === idx + 1;
                  return (
                    <button
                      key={`${san}-${idx}`}
                      type="button"
                      onClick={() => onStepRewind(idx + 1)}
                      className={`px-2 py-1 rounded text-xs font-mono cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-indigo-400 text-slate-950 font-bold'
                          : 'bg-indigo-900/80 text-indigo-200 hover:bg-indigo-800'
                      }`}
                    >
                      {idx + 1}. {san}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onStepRewind(0)}
                  className="ml-auto px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Line
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Regret Cards List (Newest First) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[30vh] md:max-h-none">
            {cards.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                Make your opening move on the 3D board (or choose a quick move below). After every
                reply, I will confess what I played, what I almost played, and what I regret.
              </div>
            ) : (
              cards.map((card) => {
                const isSelected = card.id === activeCardId;
                const isBreakdownOpen = expandedBreakdownId === card.id;
                const evalStr = `${card.evalPawnsFromBot >= 0 ? '+' : ''}${card.evalPawnsFromBot.toFixed(2)}`;

                return (
                  <article
                    key={card.id}
                    aria-label={`Turn ${card.turnNumber} Regret Card: ${card.moveSan}`}
                    className={`rounded-lg p-3.5 transition-colors border ${
                      isSelected
                        ? 'bg-[#161f30] border-[#d4af37]/70'
                        : 'bg-[#121826] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Card Header: Turn + SAN + Bot Eval + "Speak" & "Why?" Replay Buttons */}
                    <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-800/90">
                      <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap overflow-hidden">
                        <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                          Turn #{card.turnNumber}
                        </span>
                        <span className="text-slate-600 shrink-0" aria-hidden="true">·</span>
                        <span className="text-sm font-bold text-white font-mono shrink-0">
                          {card.moveSan}
                        </span>
                        <span className="text-slate-600 shrink-0" aria-hidden="true">·</span>
                        <span
                          className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                            card.evalPawnsFromBot >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                          title="Evaluation in pawns from the Bot's perspective"
                        >
                          {evalStr}p
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSpeakCard(card)}
                          aria-label={`Speak Turn ${card.turnNumber} narration out loud`}
                          title="Speak this Regret Card out loud"
                          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Speak</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectCardWhy(card)}
                          aria-label={`Why did the bot play ${card.moveSan} on turn ${card.turnNumber}?`}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            isSelected
                              ? 'bg-[#d4af37] text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Why?</span>
                        </button>
                      </div>
                    </div>

                    {/* 1. THE MOVE */}
                    <div className="mb-2.5">
                      <div className="text-[11px] font-bold tracking-wider text-[#e2c778] mb-0.5">
                        1. THE MOVE
                      </div>
                      <p className="text-xs text-slate-100 leading-relaxed select-text">
                        {card.theMoveText}
                      </p>
                    </div>

                    {/* 2. I EXPECTED */}
                    <div className="mb-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold tracking-wider text-sky-300">
                          2. I EXPECTED
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBreakdownId(isBreakdownOpen ? null : card.id)
                          }
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isBreakdownOpen ? 'Hide Eval Breakdown' : 'Eval Breakdown'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed select-text">
                        {card.iExpectedText}
                      </p>

                      {isBreakdownOpen && (
                        <div className="mt-2 p-2 rounded bg-slate-900/90 border border-slate-800 grid grid-cols-5 gap-1 text-center font-mono tabular-nums text-[11px]">
                          <div>
                            <div className="text-slate-400">Mat</div>
                            <div className="text-slate-200">{card.evalBreakdown.material}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Pos</div>
                            <div className="text-slate-200">{card.evalBreakdown.position}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Mob</div>
                            <div className="text-slate-200">{card.evalBreakdown.mobility}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">King</div>
                            <div className="text-slate-200">{card.evalBreakdown.kingSafety}</div>
                          </div>
                          <div>
                            <div className="text-slate-400">Pawn</div>
                            <div className="text-slate-200">{card.evalBreakdown.pawns}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. ALMOST PLAYED (3 Runner-Up Moves + Rejection Reasons + What If?) */}
                    {card.almostPlayed.length > 0 && (
                      <div className="mb-2.5">
                        <div className="text-[11px] font-bold tracking-wider text-amber-300 mb-1.5">
                          3. ALMOST PLAYED (HOLOGRAPHIC GHOSTS)
                        </div>
                        <div className="space-y-1.5">
                          {card.almostPlayed.map((ru) => {
                            const qualityLabel =
                              ru.quality === 'blunder'
                                ? 'Blunder'
                                : ru.quality === 'risky'
                                ? 'Risky'
                                : 'Playable';
                            const QualityIcon =
                              ru.quality === 'blunder'
                                ? ShieldAlert
                                : ru.quality === 'risky'
                                ? AlertTriangle
                                : CheckCircle2;
                            const qualityColor =
                              ru.quality === 'blunder'
                                ? 'text-rose-400'
                                : ru.quality === 'risky'
                                ? 'text-amber-400'
                                : 'text-emerald-400';

                            return (
                              <div
                                key={ru.san}
                                className="p-2 rounded bg-[#0b0f19] border border-slate-800/90 flex items-start justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 text-xs mb-0.5">
                                    <QualityIcon className={`w-3.5 h-3.5 shrink-0 ${qualityColor}`} />
                                    <span className="font-mono font-bold text-slate-100">
                                      {ru.san}
                                    </span>
                                    <span className="text-slate-500" aria-hidden="true">·</span>
                                    <span className={`text-[11px] font-medium ${qualityColor}`}>
                                      {qualityLabel}
                                    </span>
                                    <span className="text-slate-500" aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                                      {ru.evalPawns}p
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-300 leading-snug select-text">
                                    {ru.rejectionLine}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => onStartWhatIf(card, ru)}
                                  aria-label={`What if the bot played ${ru.san} on turn ${card.turnNumber}?`}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>What if?</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 4. HINDSIGHT (Populated after Human's next move) */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="text-[11px] font-bold tracking-wider text-slate-400 mb-1">
                        4. HINDSIGHT (2 PLIES DEEPER)
                      </div>
                      {!card.hindsight ? (
                        <p className="text-xs text-slate-400 italic">
                          Awaiting your reply to judge whether I regret {card.moveSan}...
                        </p>
                      ) : (
                        <div
                          className={`p-2.5 rounded border text-xs leading-relaxed ${
                            card.hindsight.type === 'REGRET'
                              ? 'bg-rose-950/50 border-rose-500/40 text-rose-100'
                              : card.hindsight.type === 'GIFT'
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-100'
                              : card.hindsight.type === 'VINDICATED'
                              ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                              : 'bg-slate-900/80 border-slate-700/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold mb-1">
                            {card.hindsight.type === 'REGRET' && (
                              <>
                                <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span className="text-rose-300">REGRET MOMENT</span>
                              </>
                            )}
                            {card.hindsight.type === 'GIFT' && (
                              <>
                                <Gift className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-emerald-300">GIFT ACCEPTED</span>
                              </>
                            )}
                            {card.hindsight.type === 'VINDICATED' && (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="text-amber-300">VINDICATED</span>
                              </>
                            )}
                            {card.hindsight.type === 'SHRUG' && (
                              <span className="text-slate-300">SHRUG</span>
                            )}
                            <span className="text-slate-500" aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-[11px]">
                              {card.hindsight.evalDifference >= 0 ? '+' : ''}
                              {Math.round(card.hindsight.evalDifference)} cp vs forecast
                            </span>
                          </div>
                          <p className="select-text">{card.hindsight.narrativeText}</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );
};
