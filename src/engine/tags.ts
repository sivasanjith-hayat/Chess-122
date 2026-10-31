/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chess, Move, PieceSymbol, Square, Color } from 'chess.js';
import { PIECE_NAMES, PIECE_VALUES, indexToSquare } from './eval';

export interface MoveFactAnalysis {
  tags: string[];
  primaryReason: string;
  rejectionReason: string;
}

const SLIDING_DIRS: Record<'b' | 'r' | 'q', [number, number][]> = {
  b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
};

function squareToCoords(sq: Square): { r: number; c: number } {
  const c = sq.charCodeAt(0) - 97;
  const r = 8 - parseInt(sq[1], 10);
  return { r, c };
}

/**
 * Finds all enemy pieces of value >= knight that the piece at `fromSq` attacks in the current position.
 */
function findAttackedValuableTargets(chess: Chess, fromSq: Square, attackerColor: Color): { square: Square; type: PieceSymbol }[] {
  const targets: { square: Square; type: PieceSymbol }[] = [];
  const board = chess.board();
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';

  // Generate legal or pseudo-legal attacks from `fromSq`
  // Note: in chess.js, chess.turn() after making the move is enemyColor.
  // So we can check `chess.isAttacked(sq, attackerColor)` or inspect moves from fromSq if it were attackerColor's turn.
  // Even better: compute geometric attacks from `fromSq` directly on `board` so we know specifically what THIS piece on `fromSq` attacks!
  const piece = chess.get(fromSq);
  if (!piece) return targets;

  const { r, c } = squareToCoords(fromSq);

  const checkTarget = (tr: number, tc: number): boolean => {
    if (tr < 0 || tr >= 8 || tc < 0 || tc >= 8) return false;
    const occ = board[tr][tc];
    if (!occ) return true; // empty, keep sliding
    if (occ.color === enemyColor && PIECE_VALUES[occ.type] >= PIECE_VALUES.n) {
      targets.push({ square: indexToSquare(tr, tc), type: occ.type });
    }
    return false; // blocked
  };

  if (piece.type === 'n') {
    const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of jumps) checkTarget(r + dr, c + dc);
  } else if (piece.type === 'p') {
    const dir = attackerColor === 'w' ? -1 : 1;
    checkTarget(r + dir, c - 1);
    checkTarget(r + dir, c + 1);
  } else if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr !== 0 || dc !== 0) checkTarget(r + dr, c + dc);
      }
    }
  } else {
    const dirs = SLIDING_DIRS[piece.type];
    for (const [dr, dc] of dirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (checkTarget(tr, tc)) {
        tr += dr;
        tc += dc;
      }
    }
  }

  return targets;
}

/**
 * Checks if a sliding piece at `fromSq` pins an enemy piece against a more valuable enemy piece (or King) along a ray.
 */
function findPinCreated(chess: Chess, fromSq: Square, attackerColor: Color): { pinned: PieceSymbol; behind: PieceSymbol } | null {
  const piece = chess.get(fromSq);
  if (!piece || (piece.type !== 'b' && piece.type !== 'r' && piece.type !== 'q')) return null;

  const board = chess.board();
  const enemyColor: Color = attackerColor === 'w' ? 'b' : 'w';
  const { r, c } = squareToCoords(fromSq);
  const dirs = SLIDING_DIRS[piece.type];

  for (const [dr, dc] of dirs) {
    let tr = r + dr;
    let tc = c + dc;
    let firstEnemy: PieceSymbol | null = null;

    while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8) {
      const occ = board[tr][tc];
      if (occ) {
        if (occ.color === attackerColor) break; // blocked by own piece
        if (!firstEnemy) {
          firstEnemy = occ.type;
        } else {
          // Second enemy piece along the ray!
          if (PIECE_VALUES[occ.type] > PIECE_VALUES[firstEnemy] && PIECE_VALUES[occ.type] >= PIECE_VALUES.r) {
            return { pinned: firstEnemy, behind: occ.type };
          }
          break;
        }
      }
      tr += dr;
      tc += dc;
    }
  }

  return null;
}

/**
 * Computes deterministic, geometry-grounded tags and reasons for a candidate move and its PV.
 */
export function analyzeMoveFacts(
  rootFen: string,
  moveObj: Move,
  pv: string[],
  scoreDiffFromBest: number // <= 0 (0 for best move, negative for worse moves)
): MoveFactAnalysis {
  const tags: string[] = [];
  const chess = new Chess(rootFen);
  const moverColor = chess.turn();
  const enemyColor: Color = moverColor === 'w' ? 'b' : 'w';

  // Execute the candidate move
  const executed = chess.move(moveObj);
  if (!executed) {
    return {
      tags: ['Legal move'],
      primaryReason: 'maintains solid coordination',
      rejectionReason: 'is less accurate than the main line',
    };
  }

  // 1. Check / Checkmate
  if (chess.isCheckmate()) {
    tags.push('Delivers checkmate');
  } else if (chess.inCheck()) {
    tags.push('Gives check');
  }

  // 2. Capture facts
  if (executed.captured) {
    const capName = PIECE_NAMES[executed.captured];
    tags.push(`Captures ${capName} on ${executed.to}`);
  }

  // 3. Promotion facts
  if (executed.promotion) {
    tags.push(`Promotes to ${PIECE_NAMES[executed.promotion]}`);
  }

  // 4. Castling / King safety
  if (executed.san === 'O-O' || executed.san === 'O-O-O') {
    tags.push('Castles to improve king safety');
  }

  // 5. Fork detection (piece at `executed.to` attacks >= 2 valuable enemy pieces)
  const targets = findAttackedValuableTargets(chess, executed.to as Square, moverColor);
  if (targets.length >= 2) {
    const names = targets.slice(0, 2).map((t) => PIECE_NAMES[t.type]);
    tags.push(`Forks ${names[0]} and ${names[1]}`);
  } else if (targets.length === 1 && !executed.captured && PIECE_VALUES[targets[0].type] > PIECE_VALUES[executed.piece]) {
    tags.push(`Wins a tempo on ${PIECE_NAMES[targets[0].type]} at ${targets[0].square}`);
  }

  // 6. Pin detection
  const pin = findPinCreated(chess, executed.to as Square, moverColor);
  if (pin) {
    tags.push(`Pins ${PIECE_NAMES[pin.pinned]} to ${PIECE_NAMES[pin.behind]}`);
  }

  // 7. Open file / Center control
  if (executed.piece === 'p' && executed.captured) {
    const file = executed.from[0].toUpperCase();
    tags.push(`Opens the ${file}-file`);
  } else if (['d4', 'e4', 'd5', 'e5'].includes(executed.to)) {
    tags.push(`Contests central square ${executed.to}`);
  }

  // 8. Analyze opponent's refutation (pv[1]) to detect hanging pieces or lost material
  let refutationFact = '';
  if (pv.length >= 2) {
    const replySan = pv[1];
    try {
      const replyMove = chess.move(replySan);
      if (replyMove) {
        if (chess.isCheckmate()) {
          tags.push(`Allows checkmate via ${replySan}`);
          refutationFact = `You answer ${replySan} with checkmate`;
        } else if (replyMove.captured) {
          const lostName = PIECE_NAMES[replyMove.captured];
          const lostVal = PIECE_VALUES[replyMove.captured];
          const gainedVal = executed.captured ? PIECE_VALUES[executed.captured] : 0;

          if (replyMove.to === executed.to) {
            if (lostVal > gainedVal + 50) {
              tags.push(`Loses ${lostName} to ${replySan}`);
              refutationFact = `You recapture with ${replySan} and win my ${lostName}`;
            } else {
              refutationFact = `You answer ${replySan}, trading on ${replyMove.to}`;
            }
          } else {
            tags.push(`Hangs ${lostName} on ${replyMove.to}`);
            refutationFact = `You reply ${replySan} and capture my ${lostName} on ${replyMove.to}`;
          }
        } else if (chess.inCheck()) {
          tags.push(`Allows check with ${replySan}`);
          refutationFact = `You counter with ${replySan} check and seize the initiative`;
        } else {
          refutationFact = `You reply ${replySan} and claim a stronger position`;
        }
      }
    } catch {
      // Fallback if PV move could not be replayed
    }
  }

  // Check if moved square is immediately attacked by a lower-value piece (hanging piece check)
  if (!refutationFact && chess.isAttacked(executed.to as Square, enemyColor)) {
    const movedPieceName = PIECE_NAMES[executed.piece];
    if (!tags.some((t) => t.includes('Hangs') || t.includes('Loses'))) {
      tags.push(`Exposes ${movedPieceName} on ${executed.to}`);
    }
  }

  if (tags.length === 0) {
    const pieceName = PIECE_NAMES[executed.piece];
    tags.push(`Develops ${pieceName} to ${executed.to}`);
  }

  const primaryReason = tags[0];

  let rejectionReason = refutationFact;
  if (!rejectionReason) {
    if (pv.length >= 2) {
      rejectionReason = `You answer ${pv[1]} and hold a ${Math.abs(Math.round(scoreDiffFromBest) / 100).toFixed(1)}-pawn better game`;
    } else if (scoreDiffFromBest < -120) {
      rejectionReason = `Drops ${(Math.abs(scoreDiffFromBest) / 100).toFixed(1)} pawns of evaluation compared to the best line`;
    } else {
      rejectionReason = `Slightly passive compared to the top choice`;
    }
  }

  return {
    tags,
    primaryReason,
    rejectionReason,
  };
}
