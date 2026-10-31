/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Flame, Gift, RotateCcw, Trophy, X } from 'lucide-react';
import { RegretCard } from '../narrator/narrator';

interface RegretReportModalProps {
  outcomeTitle: string;
  outcomeSubtitle: string;
  cards: RegretCard[];
  onPlayAgain: () => void;
  onCloseInspect: () => void;
}

export const RegretReportModal: React.FC<RegretReportModalProps> = ({
  outcomeTitle,
  outcomeSubtitle,
  cards,
  onPlayAgain,
  onCloseInspect,
}) => {
  // Chronological order (oldest to newest)
  const chronological = [...cards].reverse();

  // Top 3 Biggest Regrets (most negative evalDifference, or lowest bot eval swings)
  const biggestRegrets = [...cards]
    .filter((c) => c.hindsight && c.hindsight.evalDifference < 0)
    .sort((a, b) => (a.hindsight?.evalDifference ?? 0) - (b.hindsight?.evalDifference ?? 0))
    .slice(0, 3);

  // Top 3 Biggest Gifts (most positive evalDifference for the bot)
  const biggestGifts = [...cards]
    .filter((c) => c.hindsight && c.hindsight.evalDifference > 0)
    .sort((a, b) => (b.hindsight?.evalDifference ?? 0) - (a.hindsight?.evalDifference ?? 0))
    .slice(0, 3);

  // One-line dramatic verdict derived from game history
  const totalRegrets = cards.filter((c) => c.hindsight?.type === 'REGRET').length;
  const totalGifts = cards.filter((c) => c.hindsight?.type === 'GIFT').length;
  const avgConfidence =
    cards.length > 0
      ? Math.round(cards.reduce((acc, c) => acc + c.confidence, 0) / cards.length)
      : 55;

  let verdict =
    'A razor-sharp duel where every horizon calculation was tested to the limit.';
  if (totalRegrets > totalGifts && totalRegrets >= 2) {
    verdict = `You broke my horizon ${totalRegrets} times—I'll be replaying those missed lines all night.`;
  } else if (totalGifts > totalRegrets && totalGifts >= 1) {
    verdict = `You handed me ${totalGifts} tactical ${totalGifts === 1 ? 'gift' : 'gifts'}, and my evaluation tower feasted on every centipawn.`;
  } else if (avgConfidence >= 70) {
    verdict = `My confidence averaged ${avgConfidence}/100—my principal variations held firm from start to finish.`;
  } else if (avgConfidence <= 35) {
    verdict = `With an average confidence of ${avgConfidence}/100, I spent the whole match sweating under your pressure.`;
  }

  // Build SVG Mood & Confidence Trajectory Graph points
  const graphWidth = 560;
  const graphHeight = 120;
  const padX = 28;
  const padY = 18;
  const plotW = graphWidth - padX * 2;
  const plotH = graphHeight - padY * 2;

  const points =
    chronological.length > 0
      ? chronological.map((c, idx) => {
          const x =
            chronological.length === 1
              ? padX + plotW / 2
              : padX + (idx / (chronological.length - 1)) * plotW;
          const y = padY + ((100 - c.confidence) / 100) * plotH;
          return { x, y, turn: c.turnNumber, conf: c.confidence, san: c.moveSan };
        })
      : [
          { x: padX, y: padY + plotH * 0.45, turn: 1, conf: 55, san: '-' },
          { x: padX + plotW, y: padY + plotH * 0.45, turn: 1, conf: 55, san: '-' },
        ];

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Post-Game Regret Report"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0c111d] border border-[#d4af37]/50 rounded-xl p-6 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 mb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-[#d4af37] mb-1">
              <Trophy className="w-4 h-4" />
              <span>THE REGRET REPORT</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{outcomeTitle}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{outcomeSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={onCloseInspect}
            aria-label="Close Regret Report and Inspect Board"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* One-line Verdict */}
        <div className="p-4 rounded-lg bg-[#131b2e] border border-slate-700/80 mb-5">
          <div className="text-[11px] font-bold tracking-wider text-[#e2c778] mb-1">
            BOT VERDICT
          </div>
          <p className="text-sm md:text-base font-medium text-white leading-relaxed select-text">
            “{verdict}”
          </p>
        </div>

        {/* Mood & Confidence Graph Across the Game */}
        <div className="mb-5 p-4 rounded-lg bg-[#0f1624] border border-slate-800">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold tracking-wider text-sky-300">
              BOT MOOD & CONFIDENCE TRAJECTORY (0–100)
            </span>
            <span className="font-mono tabular-nums text-slate-400">
              Avg Confidence: {avgConfidence}/100
            </span>
          </div>
          <svg
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            className="w-full h-28 bg-[#090d16] rounded border border-slate-800/80"
            role="img"
            aria-label="Bot Confidence Graph Across Turns"
          >
            {/* Reference lines at 75, 50, 25 */}
            {[25, 50, 75].map((lvl) => {
              const y = padY + ((100 - lvl) / 100) * plotH;
              return (
                <g key={lvl}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={graphWidth - padX}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={6}
                    y={y + 3}
                    fontSize="9"
                    fill="#64748b"
                    fontFamily="monospace"
                  >
                    {lvl}
                  </text>
                </g>
              );
            })}

            {/* Confidence Polyline */}
            <polyline
              fill="none"
              stroke="#d4af37"
              strokeWidth="2.5"
              points={polylinePoints}
            />

            {/* Data nodes */}
            {points.map((pt, i) => (
              <g key={i}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  fill={pt.conf >= 65 ? '#f59e0b' : pt.conf <= 35 ? '#f43f5e' : '#38bdf8'}
                  stroke="#090d16"
                  strokeWidth="1.5"
                />
              </g>
            ))}
          </svg>
        </div>

        {/* 2-Column Grid: 3 Biggest Regrets & 3 Biggest Gifts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 3 Biggest Regrets */}
          <div className="p-4 rounded-lg bg-[#0f1624] border border-rose-500/30">
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-300 mb-3">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>3 BIGGEST BOT REGRETS</span>
            </div>
            {biggestRegrets.length === 0 ? (
              <p className="text-xs text-slate-400">
                No major eval drops recorded yet—my horizon held steady!
              </p>
            ) : (
              <div className="space-y-2.5">
                {biggestRegrets.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded bg-[#090d16] border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono mb-1">
                      <span className="font-bold text-rose-300">
                        Turn #{c.turnNumber}: Played {c.moveSan}
                      </span>
                      <span className="tabular-nums text-rose-400">
                        {Math.round(c.hindsight?.evalDifference ?? 0)} cp
                      </span>
                    </div>
                    <p className="text-slate-300 leading-snug select-text">
                      {c.hindsight?.narrativeText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3 Biggest Gifts */}
          <div className="p-4 rounded-lg bg-[#0f1624] border border-emerald-500/30">
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-emerald-300 mb-3">
              <Gift className="w-4 h-4 text-emerald-400" />
              <span>3 BIGGEST HUMAN GIFTS</span>
            </div>
            {biggestGifts.length === 0 ? (
              <p className="text-xs text-slate-400">
                You gave away zero easy tactical gifts—clinical discipline!
              </p>
            ) : (
              <div className="space-y-2.5">
                {biggestGifts.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded bg-[#090d16] border border-slate-800 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono mb-1">
                      <span className="font-bold text-emerald-300">
                        Turn #{c.turnNumber}: After {c.hindsight?.humanMoveSan}
                      </span>
                      <span className="tabular-nums text-emerald-400">
                        +{Math.round(c.hindsight?.evalDifference ?? 0)} cp
                      </span>
                    </div>
                    <p className="text-slate-300 leading-snug select-text">
                      {c.hindsight?.narrativeText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCloseInspect}
            className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Inspect 3D Board
          </button>
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="px-5 py-2.5 rounded-lg bg-[#d4af37] hover:bg-[#e5c349] text-slate-950 text-xs font-bold tracking-wide transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play New Game</span>
          </button>
        </div>
      </div>
    </div>
  );
};
