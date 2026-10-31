/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface TitleScreenProps {
  difficulty: number;
  onChangeDifficulty: (depth: number) => void;
  onStartGame: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  difficulty,
  onChangeDifficulty,
  onStartGame,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-4 md:p-7 pointer-events-none select-none"
      aria-label="Regret Chess 3D Title Screen"
    >
      {/* Compact Top-Left Negative-Space Lockup (leaves central 3D board & pieces 100% visible) */}
      <div className="max-w-sm pointer-events-auto bg-[#0b0f17]/88 border border-[#d4af37]/35 rounded-xl p-4 md:p-5 shadow-2xl">
        {/* Bespoke Inline SVG Title Emblem */}
        <svg
          viewBox="0 0 520 112"
          className="w-full max-w-[340px] h-auto mb-3"
          role="img"
          aria-label="REGRET CHESS 3D"
        >
          <defs>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f5e19c" />
              <stop offset="55%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#9a7418" />
            </linearGradient>
            <linearGradient id="crimsonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>

          {/* Crown & Shattered King Crest Icon */}
          <g transform="translate(8, 10)">
            <polygon
              points="32,8 44,32 60,16 54,56 10,56 4,16 20,32"
              fill="url(#goldGrad)"
              stroke="#1e1b18"
              strokeWidth="2"
            />
            <rect x="10" y="62" width="44" height="8" rx="2" fill="url(#goldGrad)" />
            <path
              d="M34,12 L28,34 L36,42 L26,68"
              stroke="#f43f5e"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="32" cy="4" r="3.5" fill="#f43f5e" />
          </g>

          {/* Display Typography Lockup */}
          <text
            x="84"
            y="50"
            fontFamily="'Cinzel', 'Playfair Display', Georgia, serif"
            fontSize="44"
            fontWeight="700"
            letterSpacing="3"
            fill="#f8fafc"
          >
            REGRET CHESS
          </text>
          <rect x="86" y="64" width="64" height="26" rx="4" fill="url(#crimsonGrad)" />
          <text
            x="118"
            y="82"
            textAnchor="middle"
            fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
            fontSize="15"
            fontWeight="700"
            letterSpacing="2"
            fill="#ffffff"
          >
            3D
          </text>
          <text
            x="164"
            y="82"
            fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
            fontSize="14"
            fontWeight="600"
            letterSpacing="1.5"
            fill="#d4af37"
          >
            THE BOT THAT THINKS OUT LOUD
          </text>
        </svg>

        {/* Difficulty Depth Selector (2 - 5) */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
            <span className="font-semibold tracking-wide text-[#e2c778]">
              SEARCH DEPTH
            </span>
            <span className="font-mono tabular-nums text-slate-200">
              Depth {difficulty} ({difficulty === 2 ? 'Casual' : difficulty === 3 ? 'Tactical' : difficulty === 4 ? 'Club' : 'Master'})
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Select Engine Depth">
            {[2, 3, 4, 5].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDifficulty(d)}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  difficulty === d
                    ? 'bg-[#d4af37] text-slate-950 shadow-sm'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                Depth {d}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Start CTA */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            onStartGame();
          }}
          className="w-full py-2.5 px-5 rounded-lg bg-[#d4af37] hover:bg-[#e5c349] text-slate-950 font-bold text-sm tracking-wide transition-colors shadow-lg cursor-pointer whitespace-nowrap shrink-0"
        >
          Enter the Arena (Start Match)
        </button>
      </div>

      {/* Single flat borderless control-hint line in the bottom safe margin */}
      <div className="text-center text-xs md:text-sm text-slate-100 font-medium tracking-wide bg-[#0b0f17]/88 px-4 py-1.5 rounded-md self-center shadow-lg">
        Click Any Piece on the 3D Board to Play · Orbit Drag · 1–4 Camera Presets · G Toggle Ghosts · Esc Pause
      </div>
    </div>
  );
};
