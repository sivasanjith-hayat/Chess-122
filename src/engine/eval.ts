/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chess, PieceSymbol, Square, Color } from 'chess.js';
import { EvalBreakdown } from './types';

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

// Piece-square tables from White's perspective (rank 8 at index 0, rank 1 at index 7)
const PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_PST = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [-5,  0,  5,  5,  5,  5,  0, -5],
  [0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_MIDGAME_PST = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
];

const PST_MAP: Record<PieceSymbol, number[][]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_MIDGAME_PST,
};

/**
 * Evaluates a chess.js position and returns a complete breakdown from White's perspective
 * (positive = White advantage, negative = Black advantage).
 */
export function evaluatePosition(chess: Chess): EvalBreakdown {
  if (chess.isCheckmate()) {
    const winnerSign = chess.turn() === 'w' ? -1 : 1;
    return {
      material: winnerSign * 99999,
      position: 0,
      mobility: 0,
      kingSafety: 0,
      pawns: 0,
      total: winnerSign * 99999,
    };
  }

  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return {
      material: 0,
      position: 0,
      mobility: 0,
      kingSafety: 0,
      pawns: 0,
      total: 0,
    };
  }

  const board = chess.board();
  let material = 0;
  let position = 0;
  let kingSafety = 0;
  let pawns = 0;

  let whiteBishops = 0;
  let blackBishops = 0;

  const whitePawnsPerFile = new Int8Array(8);
  const blackPawnsPerFile = new Int8Array(8);
  const whitePawnRanks: number[][] = [[], [], [], [], [], [], [], []];
  const blackPawnRanks: number[][] = [[], [], [], [], [], [], [], []];

  let whiteKingPos = { r: 7, c: 4 };
  let blackKingPos = { r: 0, c: 4 };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const isWhite = piece.color === 'w';
      const sign = isWhite ? 1 : -1;

      if (piece.type !== 'k') {
        material += sign * PIECE_VALUES[piece.type];
      }

      if (piece.type === 'b') {
        if (isWhite) whiteBishops++;
        else blackBishops++;
      }

      if (piece.type === 'k') {
        if (isWhite) whiteKingPos = { r, c };
        else blackKingPos = { r, c };
      }

      // Piece-square table lookup
      const pstRank = isWhite ? r : 7 - r;
      const pstScore = PST_MAP[piece.type][pstRank][c];
      position += sign * pstScore;

      // Track pawns for structure evaluation
      if (piece.type === 'p') {
        if (isWhite) {
          whitePawnsPerFile[c]++;
          whitePawnRanks[c].push(r);
        } else {
          blackPawnsPerFile[c]++;
          blackPawnRanks[c].push(r);
        }
      }
    }
  }

  // Bishop pair bonus
  if (whiteBishops >= 2) material += 35;
  if (blackBishops >= 2) material -= 35;

  // Pawn structure: doubled, isolated, passed pawns
  for (let c = 0; c < 8; c++) {
    // Doubled pawns penalty
    if (whitePawnsPerFile[c] > 1) pawns -= (whitePawnsPerFile[c] - 1) * 18;
    if (blackPawnsPerFile[c] > 1) pawns += (blackPawnsPerFile[c] - 1) * 18;

    // Isolated pawns penalty
    const whiteLeft = c > 0 ? whitePawnsPerFile[c - 1] : 0;
    const whiteRight = c < 7 ? whitePawnsPerFile[c + 1] : 0;
    if (whitePawnsPerFile[c] > 0 && whiteLeft === 0 && whiteRight === 0) {
      pawns -= 15;
    }

    const blackLeft = c > 0 ? blackPawnsPerFile[c - 1] : 0;
    const blackRight = c < 7 ? blackPawnsPerFile[c + 1] : 0;
    if (blackPawnsPerFile[c] > 0 && blackLeft === 0 && blackRight === 0) {
      pawns += 15;
    }

    // Passed pawns bonus
    for (const r of whitePawnRanks[c]) {
      let passed = true;
      for (let fc = Math.max(0, c - 1); fc <= Math.min(7, c + 1); fc++) {
        for (const br of blackPawnRanks[fc]) {
          if (br < r) {
            passed = false;
            break;
          }
        }
      }
      if (passed) {
        const advancement = 7 - r;
        pawns += advancement * 12;
      }
    }

    for (const r of blackPawnRanks[c]) {
      let passed = true;
      for (let fc = Math.max(0, c - 1); fc <= Math.min(7, c + 1); fc++) {
        for (const wr of whitePawnRanks[fc]) {
          if (wr > r) {
            passed = false;
            break;
          }
        }
      }
      if (passed) {
        const advancement = r;
        pawns -= advancement * 12;
      }
    }
  }

  // King safety: pawn shield in front of king and open files near king
  kingSafety += evaluateKingShield(board, whiteKingPos.r, whiteKingPos.c, 'w', whitePawnsPerFile);
  kingSafety -= evaluateKingShield(board, blackKingPos.r, blackKingPos.c, 'b', blackPawnsPerFile);

  if (chess.inCheck()) {
    kingSafety += chess.turn() === 'w' ? -25 : 25;
  }

  // Mobility approximation: count attacked/controlled squares and central control
  let mobility = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.color === 'w' ? 1 : -1;
      // Central control bonus for pieces on d4, e4, d5, e5
      if (r >= 2 && r <= 5 && c >= 2 && c <= 5) {
        const isInnerCenter = r >= 3 && r <= 4 && c >= 3 && c <= 4;
        mobility += sign * (isInnerCenter ? 8 : 4);
      }
      // Piece development mobility weight
      if (piece.type === 'n' || piece.type === 'b') {
        const homeRank = piece.color === 'w' ? 7 : 0;
        if (r !== homeRank) mobility += sign * 10;
      }
    }
  }

  const total = material + position + mobility + kingSafety + pawns;

  return {
    material,
    position,
    mobility,
    kingSafety,
    pawns,
    total,
  };
}

function evaluateKingShield(
  board: ReturnType<Chess['board']>,
  kr: number,
  kc: number,
  color: Color,
  friendlyPawnsPerFile: Int8Array
): number {
  let score = 0;
  const shieldRank1 = color === 'w' ? kr - 1 : kr + 1;
  const shieldRank2 = color === 'w' ? kr - 2 : kr + 2;

  for (let fc = Math.max(0, kc - 1); fc <= Math.min(7, kc + 1); fc++) {
    if (shieldRank1 >= 0 && shieldRank1 < 8) {
      const p1 = board[shieldRank1][fc];
      if (p1 && p1.color === color && p1.type === 'p') {
        score += 14;
      } else if (shieldRank2 >= 0 && shieldRank2 < 8) {
        const p2 = board[shieldRank2][fc];
        if (p2 && p2.color === color && p2.type === 'p') {
          score += 7;
        }
      }
    }
    if (friendlyPawnsPerFile[fc] === 0) {
      score -= 12; // Open file in front of king
    }
  }
  return score;
}

export function indexToSquare(r: number, c: number): Square {
  const file = String.fromCharCode(97 + c);
  const rank = String(8 - r);
  return `${file}${rank}` as Square;
}
