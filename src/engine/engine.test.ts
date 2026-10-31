/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { searchRootPosition, computeHindsightAnalysis } from './search';
import { NarratorEngine } from '../narrator/narrator';

interface TacticalPuzzle {
  id: number;
  name: string;
  fen: string;
  expectedMoves: string[]; // Acceptable winning/tactical SAN moves
  depth?: number;
}

const TWENTY_TACTICAL_PUZZLES: TacticalPuzzle[] = [
  {
    id: 1,
    name: 'Back-rank Mate in 1 (Rook)',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    expectedMoves: ['Re8#'],
  },
  {
    id: 2,
    name: 'Scholar Mate in 1 (Queen takes f7)',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 3',
    expectedMoves: ['Qxf7#'],
  },
  {
    id: 3,
    name: 'Fool Mate in 1 (Black Queen to h4)',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    expectedMoves: ['Qh4#'],
  },
  {
    id: 4,
    name: 'Smothered Mate in 1 (Knight to f7)',
    fen: '5rk1/8/8/4N3/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Nd7', 'Ng6', ' Nxf7'], // Wait: let's make a true smothered mate in 1: 6rk/6pp/8/4N3/8/8/5PPP/6K1 w - - 0 1 -> Nf7#
  },
  {
    id: 5,
    name: 'Queen Support Mate in 1 on g7 or back-rank d8',
    fen: '6k1/5p1p/5Qp1/8/8/2B5/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Qg7#', 'Qh8#', 'Qd8#'],
  },
  {
    id: 6,
    name: 'Arabian Mate in 1 (Rook to h7)',
    fen: '7k/2R5/5N2/8/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Rh7#'],
  },
  {
    id: 7,
    name: 'Anastasia Back-Rank Mate in 1 (Rook to c1)',
    fen: '8/8/8/8/8/4n1pk/2r5/6K1 b - - 0 1',
    expectedMoves: ['Rc1#'],
  },
  {
    id: 8,
    name: 'Epaulette Mate in 1 (Queen to e6)',
    fen: '3rkr2/8/8/8/4Q3/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Qe6#'],
  },
  {
    id: 9,
    name: 'Mate in 2: Queen sacrifice or Rook ladder',
    fen: '7k/R7/1R6/8/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Rb8#'],
  },
  {
    id: 10,
    name: 'Back-Rank Mate with Queen or Rook',
    fen: '6k1/5ppp/8/8/8/8/1Q3PPP/4R1K1 w - - 0 1',
    expectedMoves: ['Re8#', 'Qg7#', 'Qb8#'],
  },
  {
    id: 11,
    name: 'Royal Fork (Knight forks King on e8 and Queen on a6 via Nc7+)',
    fen: '4k3/8/q7/3N4/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Nc7+'],
  },
  {
    id: 12,
    name: 'Knight Fork of King and Rook on f7',
    fen: '4k2r/8/8/4N3/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Nf7', 'Ng6'],
  },
  {
    id: 13,
    name: 'Capture Undefended Queen on d5 with Knight from c3',
    fen: '4k3/5ppp/8/3q4/8/2N5/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Nxd5'],
  },
  {
    id: 14,
    name: 'Capture Undefended Rook on a8 with Bishop',
    fen: 'r3k3/5ppp/8/8/8/5B2/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Bxa8'],
  },
  {
    id: 15,
    name: 'Black Captures Hanging White Queen on e4',
    fen: '4k3/5ppp/5n2/8/4Q3/8/5PPP/6K1 b - - 0 1',
    expectedMoves: ['Nxe4'],
  },
  {
    id: 16,
    name: 'Pawn Promotion with Check / Mate',
    fen: '7k/4P1pp/8/8/8/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['e8=Q#', 'e8=R#'],
  },
  {
    id: 17,
    name: 'Bishop Captures Hanging Rook on c6 with Check',
    fen: '4k3/5ppp/2r5/8/4B3/8/5PPP/6K1 w - - 0 1',
    expectedMoves: ['Bxc6+'],
  },
  {
    id: 18,
    name: 'Pawn Fork of Two Knights on c6 and e6 via d5',
    fen: '4k3/5ppp/2n1n3/8/3P4/8/5PPP/3R2K1 w - - 0 1',
    expectedMoves: ['d5'],
  },
  {
    id: 19,
    name: 'Rook Captures Hanging Bishop on e5 with Check',
    fen: '4k3/5ppp/8/4b3/8/8/5PPP/4R1K1 w - - 0 1',
    expectedMoves: ['Rxe5+'],
  },
  {
    id: 20,
    name: 'Mate in 2: Stacked Rook Battery Back-Rank Mate (Re8+ Rxe8 Rxe8#)',
    fen: '1r4k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1',
    expectedMoves: ['Re8+'],
    depth: 3,
  },
];

// Fix puzzle 4 FEN to true Smothered Mate in 1: 6rk/6pp/8/4N3/8/8/5PPP/6K1 w - - 0 1 -> Nf7#
TWENTY_TACTICAL_PUZZLES[3].fen = '6rk/6pp/8/4N3/8/8/5PPP/6K1 w - - 0 1';
TWENTY_TACTICAL_PUZZLES[3].expectedMoves = ['Nf7#'];

// Fix puzzle 12 FEN so Knight on e5 captures Queen on g6 or forks King on d8 via Nf7+
TWENTY_TACTICAL_PUZZLES[11].fen = '3k4/8/6q1/4N3/8/8/5PPP/6K1 w - - 0 1';
TWENTY_TACTICAL_PUZZLES[11].expectedMoves = ['Nxg6', 'Nf7+'];

test('20 Tactical Puzzles (Mate in 1-2, forks, hanging pieces)', () => {
  for (const puzzle of TWENTY_TACTICAL_PUZZLES) {
    const res = searchRootPosition(puzzle.fen, { depth: puzzle.depth ?? 3, maxTimeMs: 1000 });
    assert.ok(
      puzzle.expectedMoves.includes(res.bestMove.san),
      `Puzzle #${puzzle.id} (${puzzle.name}): expected one of [${puzzle.expectedMoves.join(', ')}], got ${res.bestMove.san}`
    );
    assert.ok(res.candidates.length >= 1, `Puzzle #${puzzle.id} returned no candidates`);
    assert.ok(res.bestMove.tags.length >= 1, `Puzzle #${puzzle.id} best move has no factual tags`);
  }
});

test('Self-play 10 games checking for zero crashes, legal moves, and Narrator audit of 30+ sample Regret Cards', () => {
  const narrator = new NarratorEngine();
  const sampleCards = [];

  for (let gameIdx = 0; gameIdx < 10; gameIdx++) {
    const chess = new Chess();
    narrator.resetGame();
    let plies = 0;
    let prevBotCard = null;

    // Play 8 plies per game (80 plies total across 10 games -> >30 Regret Cards)
    while (!chess.isGameOver() && plies < 8) {
      const fenBefore = chess.fen();
      const turnColor = chess.turn();
      const searchRes = searchRootPosition(fenBefore, { depth: 2, maxTimeMs: 80 });

      // Verify bestMove is legal
      const moveExecuted = chess.move(searchRes.bestMove.san);
      assert.ok(moveExecuted, `Illegal move ${searchRes.bestMove.san} in game ${gameIdx} at FEN ${fenBefore}`);

      const card = narrator.createRegretCard({
        id: `g${gameIdx}-p${plies}`,
        turnNumber: Math.floor(plies / 2) + 1,
        fenBeforeBotMove: fenBefore,
        fenAfterBotMove: chess.fen(),
        botColor: turnColor,
        searchResult: searchRes,
      });

      // Audit every claim on the card against engine data:
      assert.ok(card.theMoveText.includes(searchRes.bestMove.san), 'THE MOVE must cite the exact SAN played');
      assert.ok(
        card.theMoveText.toLowerCase().includes(searchRes.bestMove.tags[0].toLowerCase()),
        `THE MOVE must include the primary factual tag "${searchRes.bestMove.tags[0]}" in "${card.theMoveText}"`
      );
      assert.equal(
        card.almostPlayed.length,
        Math.max(0, searchRes.candidates.length - 1),
        'ALMOST PLAYED count must match runner-up candidates'
      );
      for (let i = 0; i < card.almostPlayed.length; i++) {
        const runnerUp = card.almostPlayed[i];
        const engineCand = searchRes.candidates[i + 1];
        assert.equal(runnerUp.san, engineCand.san);
        assert.ok(runnerUp.rejectionLine.startsWith(`${engineCand.san}?`));
      }

      if (prevBotCard) {
        const hs = computeHindsightAnalysis({
          fenAfterHumanReply: fenBefore,
          botColor: prevBotCard.botColor,
          botOriginalDepth: 1,
          botMoveSan: prevBotCard.moveSan,
          botPredictedEvalFromBotPerspective: prevBotCard.evalPawnsFromBot * 100,
          botPredictedHumanReplySan: prevBotCard.predictedReplySan,
          humanActualMoveSan: searchRes.bestMove.san,
          botRunnerUps: searchRes.candidates.slice(1),
        });
        const updatedPrev = narrator.attachHindsight(prevBotCard, hs);
        assert.ok(updatedPrev.hindsight, 'Hindsight must be attached');
        assert.ok(
          ['REGRET', 'GIFT', 'VINDICATED', 'SHRUG'].includes(updatedPrev.hindsight.type),
          'Hindsight type must be one of the 4 valid states'
        );
        sampleCards.push(updatedPrev);
      }

      prevBotCard = card;
      plies++;
    }
  }

  assert.ok(sampleCards.length >= 30, `Expected at least 30 audited Regret Cards, got ${sampleCards.length}`);
});
