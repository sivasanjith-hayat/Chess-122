/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import {
  BarChart3,
  Camera,
  Eye,
  EyeOff,
  FlipHorizontal,
  Grid,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  PIECE_AUDIO_PROFILES,
  soundEngine,
  VOICE_PROFILE_LABELS,
  VoiceProfile,
} from './audio/soundEngine';
import { RegretJournal, RewindState } from './components/RegretJournal';
import { RegretReportModal } from './components/RegretReportModal';
import { TitleScreen } from './components/TitleScreen';
import { BotMood, CandidateMove } from './engine/types';
import { EngineWorkerClient, ThinkingStatus } from './engine/workerClient';
import { NarratorEngine, RegretCard, RunnerUpEntry } from './narrator/narrator';
import { CameraPreset, ChessScene3D, ProjectedGhostLabel } from './scene/ChessScene3D';

type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';
type NarrationSpeed = 'fast' | 'normal' | 'dramatic';

interface PendingPromotion {
  from: Square;
  to: Square;
}

interface TurnSnapshot {
  fen: string;
  cards: RegretCard[];
  botMood: BotMood;
  botConfidence: number;
  lastMove?: { from: Square; to: Square };
}

export default function App() {
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const prefersReducedMotionInit = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const [shellState, setShellState] = useState<GameShellState>(isAutostart ? 'playing' : 'title');
  const [fen, setFen] = useState<string>(() => new Chess().fen());
  const [humanColor, setHumanColor] = useState<Color>('w');
  const [difficulty, setDifficulty] = useState<number>(4);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [pieceVoiceEnabled, setPieceVoiceEnabled] = useState<boolean>(true);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>('dramatist');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [showVoiceStudio, setShowVoiceStudio] = useState<boolean>(false);
  const [narrationSpeed, setNarrationSpeed] = useState<NarrationSpeed>('normal');
  const [showGhosts, setShowGhosts] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(prefersReducedMotionInit);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(isAutostart ? 'white' : 'title');

  // Selection & Legal Moves
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | undefined>(undefined);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [sanInput, setSanInput] = useState<string>('');
  const [moveError, setMoveError] = useState<string | null>(null);

  // Bot & Regret Journal State
  const [cards, setCards] = useState<RegretCard[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [botMood, setBotMood] = useState<BotMood>('calm');
  const [botConfidence, setBotConfidence] = useState<number>(55);
  const [thinking, setThinking] = useState<ThinkingStatus>({
    isThinking: false,
    depth: 0,
    currentBestSan: '',
    nodes: 0,
  });
  const [isJournalCollapsed, setIsJournalCollapsed] = useState<boolean>(false);
  const [rewindState, setRewindState] = useState<RewindState | null>(null);
  const [ghostLabels, setGhostLabels] = useState<ProjectedGhostLabel[]>([]);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [show2DBoard, setShow2DBoard] = useState<boolean>(false);

  // Undo history stack of human turns
  const [historyStack, setHistoryStack] = useState<TurnSnapshot[]>([]);

  // Refs for stable 3D scene & worker lifecycle
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ChessScene3D | null>(null);
  const workerClientRef = useRef<EngineWorkerClient | null>(null);
  const narratorRef = useRef<NarratorEngine>(new NarratorEngine());
  const chessRef = useRef<Chess>(new Chess());
  const lastBotCandidatesRef = useRef<CandidateMove[]>([]);
  const handleSquareClickRef = useRef<(sq: Square) => void>(() => {});

  // Mirror shellState to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  // Compute current legal moves sorted by tactical & central priority for Quick Move buttons
  const currentLegalMoves = useMemo(() => {
    try {
      const c = new Chess(fen);
      const moves = c.moves({ verbose: true });
      const preferredSans = new Set([
        'e4', 'd4', 'Nf3', 'Nc3', 'Bc4', 'Bb5', 'c4', 'Bf4', 'O-O', 'e5', 'd5', 'Nf6', 'Nc6',
      ]);
      moves.sort((a, b) => {
        const aScore =
          (a.captured ? 100 : 0) +
          (a.san.includes('+') ? 80 : 0) +
          (preferredSans.has(a.san) ? 50 : 0);
        const bScore =
          (b.captured ? 100 : 0) +
          (b.san.includes('+') ? 80 : 0) +
          (preferredSans.has(b.san) ? 50 : 0);
        return bScore - aScore;
      });
      return moves;
    } catch {
      return [];
    }
  }, [fen]);

  const gameStatus = useMemo(() => {
    const c = new Chess(fen);
    const isOver = c.isGameOver();
    let title = 'Match in Progress';
    let subtitle = `${c.turn() === 'w' ? 'White' : 'Black'} to move`;

    if (c.isCheckmate()) {
      const winner = c.turn() === 'w' ? 'Black' : 'White';
      title = `Checkmate — ${winner} Wins!`;
      subtitle =
        (c.turn() === humanColor ? 'The Bot toppled your King.' : 'You toppled the Bot’s King!');
    } else if (c.isStalemate()) {
      title = 'Draw by Stalemate';
      subtitle = 'No legal moves remain.';
    } else if (c.isThreefoldRepetition()) {
      title = 'Draw by Threefold Repetition';
      subtitle = 'Position repeated three times.';
    } else if (c.isInsufficientMaterial()) {
      title = 'Draw by Insufficient Material';
      subtitle = 'Neither side has sufficient mating material.';
    } else if (c.isDraw()) {
      title = 'Draw (50-Move Rule)';
      subtitle = 'Fifty moves without a pawn advance or capture.';
    } else if (c.inCheck()) {
      subtitle = `${c.turn() === 'w' ? 'White' : 'Black'} is in CHECK!`;
    }

    return { isOver, title, subtitle, inCheck: c.inCheck(), turn: c.turn() };
  }, [fen, humanColor]);

  // Helper to find king square when in check
  const getInCheckKingSquare = useCallback((chessInstance: Chess): Square | null => {
    if (!chessInstance.inCheck()) return null;
    const turn = chessInstance.turn();
    const board = chessInstance.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) {
          return p.square as Square;
        }
      }
    }
    return null;
  }, []);

  // Trigger Bot Turn via Web Worker
  const triggerBotTurn = useCallback(
    async (
      currentFen: string,
      botColor: Color,
      humanMoveJustPlayedSan?: string,
      prevCardsList?: RegretCard[]
    ) => {
      if (!workerClientRef.current) return;
      const tempChess = new Chess(currentFen);
      if (tempChess.isGameOver()) {
        setShellState('gameover');
        setShowReportModal(true);
        return;
      }

      const currentCards = prevCardsList ?? cards;
      const latestBotCard = currentCards[0];

      const hindsightReq =
        latestBotCard && humanMoveJustPlayedSan
          ? {
              botColor,
              botOriginalDepth: latestBotCard.depthReached,
              botMoveSan: latestBotCard.moveSan,
              botPredictedEvalFromBotPerspective: latestBotCard.evalPawnsFromBot * 100,
              botPredictedHumanReplySan: latestBotCard.predictedReplySan,
              humanActualMoveSan: humanMoveJustPlayedSan,
              botRunnerUps: lastBotCandidatesRef.current.slice(1),
            }
          : undefined;

      setThinking({
        isThinking: true,
        depth: 1,
        currentBestSan: '...',
        nodes: 0,
      });

      try {
        const turnStartMs = performance.now();
        const maxTimeMs =
          narrationSpeed === 'fast' ? 450 : narrationSpeed === 'dramatic' ? 1100 : 800;

        const { searchResult, hindsight } = await workerClientRef.current.searchAndHindsight(
          currentFen,
          { depth: difficulty, maxTimeMs },
          hindsightReq,
          (prog) => setThinking(prog)
        );

        // Allow the human player's 3D hand reach-and-place animation (740ms) to complete smoothly before the bot's hand reaches out
        if (humanMoveJustPlayedSan && !reducedMotion) {
          const elapsedMs = performance.now() - turnStartMs;
          if (elapsedMs < 750) {
            await new Promise((resolve) => window.setTimeout(resolve, 750 - elapsedMs));
          }
        }

        setThinking({ isThinking: false, depth: 0, currentBestSan: '', nodes: 0 });

        // Execute bot's chosen bestMove on chessRef
        const moveObj = chessRef.current.move(searchResult.bestMove.san);
        if (!moveObj) return;

        const newFen = chessRef.current.fen();
        const isCapture = Boolean(moveObj.captured);
        const isCheck = chessRef.current.inCheck();
        const isCheckmate = chessRef.current.isCheckmate();

        // Piece-specific synthesized audio feedback
        if (moveObj.promotion) soundEngine.playPromotion();
        if (isCheckmate) soundEngine.playCheckmate();
        else if (isCheck) soundEngine.playCheck();
        else if (isCapture) soundEngine.playCapture(moveObj.piece, moveObj.captured);
        else soundEngine.playPieceMove(moveObj.piece, true, moveObj.san);

        // Update previous card with Hindsight if available
        let updatedCards = [...currentCards];
        if (hindsight && updatedCards.length > 0) {
          const withHindsight = narratorRef.current.attachHindsight(updatedCards[0], hindsight);
          updatedCards[0] = withHindsight;

          if (hindsight.type === 'REGRET') {
            soundEngine.playRegretMoment();
            sceneRef.current?.triggerRegretMoment(
              withHindsight.fenBeforeBotMove,
              hindsight.betterMoveSan
            );
          } else if (hindsight.type === 'GIFT') {
            soundEngine.playGiftMoment();
            sceneRef.current?.clearRegretMoment();
          } else {
            sceneRef.current?.clearRegretMoment();
          }
        }

        // Create new Regret Card for this bot turn
        const turnNum = Math.ceil(chessRef.current.history().length / 2);
        const newCard = narratorRef.current.createRegretCard({
          id: `card-${Date.now()}-${turnNum}`,
          turnNumber: turnNum,
          fenBeforeBotMove: currentFen,
          fenAfterBotMove: newFen,
          botColor,
          searchResult,
          previousBotEvalCp: latestBotCard ? latestBotCard.evalPawnsFromBot * 100 : undefined,
        });

        // Speak the bot's Regret Card + Hindsight out loud
        soundEngine.speakRegretCard(
          newCard,
          hindsight ? updatedCards[0]?.hindsight : undefined,
          narrationSpeed
        );

        lastBotCandidatesRef.current = searchResult.candidates;
        const nextCards = [newCard, ...updatedCards];

        setCards(nextCards);
        setActiveCardId(newCard.id);
        setBotMood(newCard.mood);
        setBotConfidence(newCard.confidence);
        setFen(newFen);
        const botLastMove = { from: moveObj.from as Square, to: moveObj.to as Square };
        setLastMove(botLastMove);

        // Sync 3D scene
        if (sceneRef.current) {
          sceneRef.current.setBotMood(newCard.mood);
          sceneRef.current.setEvalScoreWhiteCp(newCard.evalScoreWhiteCp);
          sceneRef.current.syncBoardFromFen(
            newFen,
            { from: botLastMove.from, to: botLastMove.to, captured: isCapture },
            true
          );
          sceneRef.current.updateHighlights({
            selectedSquare: null,
            legalTargets: [],
            lastMove: botLastMove,
            inCheckKingSquare: getInCheckKingSquare(chessRef.current),
          });
          sceneRef.current.setGhostMoves(
            newCard.fenBeforeBotMove,
            newCard.almostPlayed,
            showGhosts
          );
        }

        if (chessRef.current.isGameOver()) {
          setShellState('gameover');
          setShowReportModal(true);
        }
      } catch (err) {
        console.error('Engine search error:', err);
        setThinking({ isThinking: false, depth: 0, currentBestSan: '', nodes: 0 });
      }
    },
    [cards, difficulty, getInCheckKingSquare, narrationSpeed, reducedMotion, showGhosts]
  );

  // Execute a verified legal human move
  const executeHumanMove = useCallback(
    (moveInput: string | { from: string; to: string; promotion?: string }) => {
      if (thinking.isThinking) return false;
      if (rewindState) {
        setRewindState(null);
      }

      const snapshot: TurnSnapshot = {
        fen: chessRef.current.fen(),
        cards: [...cards],
        botMood,
        botConfidence,
        lastMove,
      };

      let moveObj: Move | null = null;
      try {
        moveObj = chessRef.current.move(moveInput);
      } catch {
        moveObj = null;
      }

      if (!moveObj) {
        setMoveError('Illegal move in current position.');
        return false;
      }

      setMoveError(null);
      setHistoryStack((prev) => [...prev, snapshot]);
      setSelectedSquare(null);
      setLegalTargets([]);
      setPendingPromotion(null);

      const newFen = chessRef.current.fen();
      const humanLastMove = { from: moveObj.from as Square, to: moveObj.to as Square };
      setFen(newFen);
      setLastMove(humanLastMove);

      const isCapture = Boolean(moveObj.captured);
      const isCheck = chessRef.current.inCheck();
      if (moveObj.promotion) soundEngine.playPromotion();
      if (chessRef.current.isCheckmate()) soundEngine.playCheckmate();
      else if (isCheck) soundEngine.playCheck();
      else if (isCapture) soundEngine.playCapture(moveObj.piece, moveObj.captured);
      else soundEngine.playPieceMove(moveObj.piece, false, moveObj.san);

      if (pieceVoiceEnabled && voiceProfile === 'royal_court') {
        soundEngine.speakPieceCallout(moveObj.piece, moveObj.san, isCapture, isCheck);
      }

      if (sceneRef.current) {
        sceneRef.current.syncBoardFromFen(
          newFen,
          { from: humanLastMove.from, to: humanLastMove.to, captured: isCapture },
          true
        );
        sceneRef.current.updateHighlights({
          selectedSquare: null,
          legalTargets: [],
          lastMove: humanLastMove,
          inCheckKingSquare: getInCheckKingSquare(chessRef.current),
        });
      }

      if (chessRef.current.isGameOver()) {
        setShellState('gameover');
        setShowReportModal(true);
        return true;
      }

      const botColor: Color = humanColor === 'w' ? 'b' : 'w';
      triggerBotTurn(newFen, botColor, moveObj.san, cards);
      return true;
    },
    [
      botConfidence,
      botMood,
      cards,
      getInCheckKingSquare,
      humanColor,
      lastMove,
      rewindState,
      thinking.isThinking,
      triggerBotTurn,
    ]
  );

  // Handle 3D or 2D Square Click
  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (thinking.isThinking || shellState === 'paused' || shellState === 'gameover') return;

      // If user clicks directly on the 3D board while on the title screen, transition into playing immediately
      if (shellState === 'title') {
        setShellState('playing');
        const preset: CameraPreset = humanColor === 'w' ? 'white' : 'black';
        setCameraPreset(preset);
        sceneRef.current?.setJournalOpenOffset(!isJournalCollapsed);
        sceneRef.current?.setCameraPreset(preset, false);
      }

      // If in What-If Rewind mode, exit rewind first
      if (rewindState) {
        setRewindState(null);
        sceneRef.current?.syncBoardFromFen(chessRef.current.fen(), undefined, false);
      }

      const turn = chessRef.current.turn();
      if (turn !== humanColor) return;

      // Check if clicked square is a legal target from `selectedSquare`
      if (selectedSquare && legalTargets.includes(sq)) {
        const piece = chessRef.current.get(selectedSquare);
        const isPromotion =
          piece &&
          piece.type === 'p' &&
          ((piece.color === 'w' && sq[1] === '8') || (piece.color === 'b' && sq[1] === '1'));

        if (isPromotion) {
          setPendingPromotion({ from: selectedSquare, to: sq });
          return;
        }

        executeHumanMove({ from: selectedSquare, to: sq });
        return;
      }

      // Otherwise check if clicked square has a friendly piece
      const clickedPiece = chessRef.current.get(sq);
      if (clickedPiece && clickedPiece.color === humanColor) {
        soundEngine.playPieceSelect(clickedPiece.type, clickedPiece.color === 'w');
        const movesFromSq = chessRef.current.moves({ square: sq, verbose: true });
        const targets = movesFromSq.map((m) => m.to as Square);
        setSelectedSquare(sq);
        setLegalTargets(targets);
        sceneRef.current?.updateHighlights({
          selectedSquare: sq,
          legalTargets: targets,
          lastMove,
          inCheckKingSquare: getInCheckKingSquare(chessRef.current),
        });
      } else {
        setSelectedSquare(null);
        setLegalTargets([]);
        sceneRef.current?.updateHighlights({
          selectedSquare: null,
          legalTargets: [],
          lastMove,
          inCheckKingSquare: getInCheckKingSquare(chessRef.current),
        });
      }
    },
    [
      executeHumanMove,
      getInCheckKingSquare,
      humanColor,
      isJournalCollapsed,
      lastMove,
      legalTargets,
      rewindState,
      selectedSquare,
      shellState,
      thinking.isThinking,
    ]
  );

  useEffect(() => {
    handleSquareClickRef.current = handleSquareClick;
  }, [handleSquareClick]);

  // Initialize Three.js Scene & Web Worker once on mount
  useEffect(() => {
    workerClientRef.current = new EngineWorkerClient();
    soundEngine.onSpeakingStateChange((speaking) => setIsSpeaking(speaking));

    if (canvasMountRef.current && !sceneRef.current) {
      try {
        const scene3D = new ChessScene3D(canvasMountRef.current, {
          onSquareClick: (sq) => handleSquareClickRef.current(sq),
          onGhostLabelsUpdate: (labels) => setGhostLabels(labels),
        });
        scene3D.setReducedMotion(prefersReducedMotionInit);
        scene3D.syncBoardFromFen(chessRef.current.fen(), undefined, false);
        scene3D.setJournalOpenOffset(true);
        scene3D.setCameraPreset(isAutostart ? 'white' : 'title', true);
        sceneRef.current = scene3D;
      } catch (err) {
        console.error('WebGL initialization fallback:', err);
        setShow2DBoard(true);
      }
    }

    return () => {
      workerClientRef.current?.dispose();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [isAutostart, prefersReducedMotionInit]);

  // Sync camera offset when journal collapses/expands
  useEffect(() => {
    sceneRef.current?.setJournalOpenOffset(!isJournalCollapsed);
  }, [isJournalCollapsed]);

  // Start Game from Title Screen
  const handleStartGame = useCallback(() => {
    setShellState('playing');
    setShowReportModal(false);
    const preset: CameraPreset = humanColor === 'w' ? 'white' : 'black';
    setCameraPreset(preset);
    sceneRef.current?.setJournalOpenOffset(!isJournalCollapsed);
    sceneRef.current?.setCameraPreset(preset, false);
  }, [humanColor, isJournalCollapsed]);

  // Reset / Start a Brand New Game
  const handleNewGame = useCallback(
    (playAsColor: Color = humanColor) => {
      chessRef.current = new Chess();
      narratorRef.current.resetGame();
      lastBotCandidatesRef.current = [];
      const initialFen = chessRef.current.fen();

      setFen(initialFen);
      setCards([]);
      setActiveCardId(null);
      setBotMood('calm');
      setBotConfidence(55);
      setSelectedSquare(null);
      setLegalTargets([]);
      setLastMove(undefined);
      setPendingPromotion(null);
      setRewindState(null);
      setHistoryStack([]);
      setShowReportModal(false);
      setShellState('playing');

      const preset: CameraPreset = playAsColor === 'w' ? 'white' : 'black';
      setCameraPreset(preset);

      if (sceneRef.current) {
        sceneRef.current.clearRegretMoment();
        sceneRef.current.setBotMood('calm');
        sceneRef.current.setEvalScoreWhiteCp(0);
        sceneRef.current.syncBoardFromFen(initialFen, undefined, false);
        sceneRef.current.updateHighlights({
          selectedSquare: null,
          legalTargets: [],
        });
        sceneRef.current.setGhostMoves(initialFen, [], false);
        sceneRef.current.setCameraPreset(preset, false);
      }

      if (playAsColor === 'b') {
        triggerBotTurn(initialFen, 'w', undefined, []);
      }
    },
    [humanColor, triggerBotTurn]
  );

  // Undo last human + bot turn pair
  const handleUndo = useCallback(() => {
    if (thinking.isThinking || historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setHistoryStack((s) => s.slice(0, -1));

    chessRef.current = new Chess(prev.fen);
    setFen(prev.fen);
    setCards(prev.cards);
    setActiveCardId(prev.cards[0]?.id ?? null);
    setBotMood(prev.botMood);
    setBotConfidence(prev.botConfidence);
    setLastMove(prev.lastMove);
    setSelectedSquare(null);
    setLegalTargets([]);
    setRewindState(null);
    setShowReportModal(false);
    setShellState('playing');

    if (sceneRef.current) {
      sceneRef.current.clearRegretMoment();
      sceneRef.current.setBotMood(prev.botMood);
      sceneRef.current.syncBoardFromFen(prev.fen, undefined, false);
      sceneRef.current.updateHighlights({
        selectedSquare: null,
        legalTargets: [],
        lastMove: prev.lastMove,
        inCheckKingSquare: getInCheckKingSquare(chessRef.current),
      });
      if (prev.cards[0]) {
        sceneRef.current.setGhostMoves(
          prev.cards[0].fenBeforeBotMove,
          prev.cards[0].almostPlayed,
          showGhosts
        );
      } else {
        sceneRef.current.setGhostMoves(prev.fen, [], false);
      }
    }
  }, [getInCheckKingSquare, historyStack, showGhosts, thinking.isThinking]);

  // Flip Board / Switch perspective
  const handleFlipBoard = useCallback(() => {
    const nextPreset: CameraPreset = cameraPreset === 'black' ? 'white' : 'black';
    setCameraPreset(nextPreset);
    sceneRef.current?.setCameraPreset(nextPreset, false);
    const nextColor: Color = humanColor === 'w' ? 'b' : 'w';
    setHumanColor(nextColor);
    if (chessRef.current.turn() !== nextColor && !chessRef.current.isGameOver()) {
      triggerBotTurn(chessRef.current.fen(), nextColor === 'w' ? 'b' : 'w', undefined, cards);
    }
  }, [cameraPreset, cards, humanColor, triggerBotTurn]);

  // Toggle Ghosts
  const handleToggleGhosts = useCallback(() => {
    const next = !showGhosts;
    setShowGhosts(next);
    const activeCard = cards.find((c) => c.id === activeCardId) || cards[0];
    if (activeCard && sceneRef.current) {
      sceneRef.current.setGhostMoves(activeCard.fenBeforeBotMove, activeCard.almostPlayed, next);
    }
  }, [activeCardId, cards, showGhosts]);

  // Replay "Why?" on any past Regret Card
  const handleSelectCardWhy = useCallback(
    (card: RegretCard) => {
      setActiveCardId(card.id);
      setRewindState(null);
      if (!showGhosts) setShowGhosts(true);
      soundEngine.speakRegretCard(card, card.hindsight, narrationSpeed);

      if (sceneRef.current) {
        sceneRef.current.setBotMood(card.mood);
        sceneRef.current.setEvalScoreWhiteCp(card.evalScoreWhiteCp);
        sceneRef.current.setGhostMoves(card.fenBeforeBotMove, card.almostPlayed, true);
        if (card.hindsight?.type === 'REGRET') {
          sceneRef.current.triggerRegretMoment(
            card.fenBeforeBotMove,
            card.hindsight.betterMoveSan
          );
        } else {
          sceneRef.current.clearRegretMoment();
        }
      }
    },
    [narrationSpeed, showGhosts]
  );

  // Speak any Regret Card on demand
  const handleSpeakCard = useCallback(
    (card: RegretCard) => {
      if (!soundEnabled) {
        setSoundEnabled(true);
        soundEngine.setEnabled(true);
      }
      if (!voiceEnabled) {
        setVoiceEnabled(true);
        soundEngine.setVoiceEnabled(true);
      }
      soundEngine.speakRegretCard(card, card.hindsight, narrationSpeed);
    },
    [narrationSpeed, soundEnabled, voiceEnabled]
  );

  // Start "What If?" Rewind on a runner-up move
  const handleStartWhatIf = useCallback((card: RegretCard, runnerUp: RunnerUpEntry) => {
    const temp = new Chess(card.fenBeforeBotMove);
    const fens: string[] = [card.fenBeforeBotMove];
    for (const san of runnerUp.pv) {
      try {
        if (temp.move(san)) {
          fens.push(temp.fen());
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    const step1Fen = fens[1] || card.fenBeforeBotMove;
    setRewindState({
      cardId: card.id,
      runnerUp,
      baseFen: card.fenBeforeBotMove,
      stepIndex: 1,
      fens,
    });
    setActiveCardId(card.id);

    if (sceneRef.current) {
      sceneRef.current.syncBoardFromFen(step1Fen, undefined, true);
      sceneRef.current.setGhostMoves(card.fenBeforeBotMove, [runnerUp], true);
    }
  }, []);

  const handleStepRewind = useCallback(
    (nextStep: number) => {
      if (!rewindState) return;
      const clamped = Math.max(0, Math.min(rewindState.fens.length - 1, nextStep));
      setRewindState({ ...rewindState, stepIndex: clamped });
      const targetFen = rewindState.fens[clamped];
      sceneRef.current?.syncBoardFromFen(targetFen, undefined, true);
    },
    [rewindState]
  );

  const handleExitRewind = useCallback(() => {
    setRewindState(null);
    const liveFen = chessRef.current.fen();
    sceneRef.current?.syncBoardFromFen(liveFen, undefined, false);
    const activeCard = cards.find((c) => c.id === activeCardId) || cards[0];
    if (activeCard && sceneRef.current) {
      sceneRef.current.setGhostMoves(
        activeCard.fenBeforeBotMove,
        activeCard.almostPlayed,
        showGhosts
      );
    }
  }, [activeCardId, cards, showGhosts]);

  // Global Keyboard Shortcuts (Title Start, Camera 1-4, Ghosts G, Pause Esc/P)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (shellState === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleStartGame();
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (shellState === 'playing') {
          setShellState('paused');
        } else if (shellState === 'paused') {
          setShellState('playing');
        }
      } else if (e.key === '1') {
        setCameraPreset('white');
        sceneRef.current?.setCameraPreset('white');
      } else if (e.key === '2') {
        setCameraPreset('black');
        sceneRef.current?.setCameraPreset('black');
      } else if (e.key === '3') {
        setCameraPreset('top');
        sceneRef.current?.setCameraPreset('top');
      } else if (e.key === '4') {
        setCameraPreset('cinematic');
        sceneRef.current?.setCameraPreset('cinematic');
      } else if (e.key === '5') {
        setCameraPreset('cafe');
        sceneRef.current?.setCameraPreset('cafe');
      } else if (e.key === 'g' || e.key === 'G') {
        handleToggleGhosts();
      } else if (e.key === 'h' || e.key === 'H') {
        setIsJournalCollapsed((c) => !c);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartGame, handleToggleGhosts, shellState]);

  const evalWhitePawns = useMemo(() => {
    const latest = cards[0];
    if (!latest) return '0.00';
    const val = latest.evalScoreWhiteCp / 100;
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}`;
  }, [cards]);

  const board2DGrid = useMemo(() => {
    try {
      const c = new Chess(rewindState ? rewindState.fens[rewindState.stepIndex] || fen : fen);
      const raw = c.board();
      return humanColor === 'w' ? raw : [...raw].reverse().map((row) => [...row].reverse());
    } catch {
      return [];
    }
  }, [fen, humanColor, rewindState]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0f172a] select-none">
      {/* Isolated 3D WebGL Canvas Mount Container */}
      <div
        ref={canvasMountRef}
        data-testid="chess-3d-canvas"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }}
        className="fixed inset-0 w-screen h-screen z-0"
      />

      {/* 3D Projected Floating Ghost Labels Overlay */}
      {shellState === 'playing' && showGhosts && ghostLabels.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden" aria-hidden="true">
          {ghostLabels.map((lbl) =>
            lbl.visible ? (
              <div
                key={lbl.id}
                style={{
                  transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
                }}
                className={`absolute top-0 left-0 px-2 py-1 rounded border text-[11px] font-mono shadow-lg max-w-[210px] ${
                  lbl.quality === 'blunder'
                    ? 'bg-rose-950/92 border-rose-500/70 text-rose-100'
                    : lbl.quality === 'risky'
                    ? 'bg-amber-950/92 border-amber-500/70 text-amber-100'
                    : 'bg-emerald-950/92 border-emerald-500/70 text-emerald-100'
                }`}
              >
                <div className="font-bold">
                  Ghost: {lbl.san} ({lbl.evalPawns}p)
                </div>
                <div className="text-[10px] font-sans opacity-90 truncate">{lbl.reason}</div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Title Screen Overlay */}
      {shellState === 'title' && (
        <TitleScreen
          difficulty={difficulty}
          onChangeDifficulty={setDifficulty}
          onStartGame={handleStartGame}
        />
      )}

      {/* Active Playing HUD */}
      {shellState !== 'title' && (
        <>
          {/* Top Bar Controls */}
          <div
            role="toolbar"
            aria-label="Game and Scene Controls"
            className="fixed top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none"
          >
            {/* Left Cluster: Brand Badge + Eval Readout + Game Actions */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#0d121d]/94 border border-slate-700/80 rounded-lg px-3 py-1.5 shadow-xl pointer-events-auto">
              <span className="text-xs font-bold tracking-wider text-[#d4af37] mr-1 whitespace-nowrap">
                REGRET CHESS 3D
              </span>

              <span
                className="text-xs font-mono tabular-nums px-2 py-0.5 rounded bg-slate-800/90 text-slate-200 whitespace-nowrap"
                title="3D Evaluation Tower Score (White perspective)"
              >
                Tower: {evalWhitePawns}p
              </span>

              <button
                type="button"
                onClick={() => handleNewGame(humanColor)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New Game</span>
              </button>

              <button
                type="button"
                onClick={handleUndo}
                disabled={historyStack.length === 0 || thinking.isThinking}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>

              <button
                type="button"
                onClick={handleFlipBoard}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>Flip ({humanColor === 'w' ? 'White' : 'Black'})</span>
              </button>

              {/* Difficulty Slider / Selector (2-5) */}
              <label className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/80 text-xs text-slate-200 whitespace-nowrap shrink-0">
                <span>Depth:</span>
                <select
                  aria-label="Difficulty Depth"
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                  className="bg-transparent font-mono font-bold text-[#e2c778] cursor-pointer"
                >
                  <option value={2} className="bg-slate-900">2 (Fast)</option>
                  <option value={3} className="bg-slate-900">3 (Tactical)</option>
                  <option value={4} className="bg-slate-900">4 (Default)</option>
                  <option value={5} className="bg-slate-900">5 (Master)</option>
                </select>
              </label>
            </div>

            {/* Right Cluster: Camera Presets + Ghosts + Audio + Speed + Reduced Motion + Report */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#0d121d]/94 border border-slate-700/80 rounded-lg px-3 py-1.5 shadow-xl pointer-events-auto">
              {/* Camera Preset Buttons */}
              <div className="flex items-center gap-1" role="group" aria-label="Camera View Presets">
                <Camera className="w-3.5 h-3.5 text-slate-400 mr-0.5 hidden sm:inline" />
                {(['white', 'black', 'top', 'cinematic', 'cafe'] as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setCameraPreset(preset);
                      sceneRef.current?.setCameraPreset(preset, false);
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      cameraPreset === preset
                        ? 'bg-[#d4af37] text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {preset === 'top' ? 'Top-Down' : preset === 'cafe' ? 'Cafe Table' : preset}
                  </button>
                ))}
              </div>

              {/* Show Ghosts Toggle */}
              <button
                type="button"
                onClick={handleToggleGhosts}
                aria-pressed={showGhosts}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showGhosts
                    ? 'bg-emerald-700/90 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {showGhosts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>Ghosts</span>
              </button>

              {/* 2D Mini-Board Toggle */}
              <button
                type="button"
                onClick={() => setShow2DBoard((v) => !v)}
                aria-pressed={show2DBoard}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  show2DBoard
                    ? 'bg-[#d4af37] text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>2D Board</span>
              </button>

              {/* Voice Narration Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !voiceEnabled;
                  setVoiceEnabled(next);
                  soundEngine.setVoiceEnabled(next);
                }}
                aria-pressed={voiceEnabled}
                title="Toggle Spoken Bot Voice Narration"
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  voiceEnabled
                    ? 'bg-amber-600/95 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {voiceEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{voiceEnabled ? 'Voice: On' : 'Voice: Off'}</span>
              </button>

              {/* Voices & Piece Sound Studio Drawer Toggle */}
              <button
                type="button"
                onClick={() => setShowVoiceStudio((v) => !v)}
                aria-pressed={showVoiceStudio}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  showVoiceStudio
                    ? 'bg-[#d4af37] text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Voices & Piece SFX</span>
              </button>

              {/* Narration Speed */}
              <label className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 whitespace-nowrap shrink-0">
                <span>Pace:</span>
                <select
                  aria-label="Narration Speed"
                  value={narrationSpeed}
                  onChange={(e) => setNarrationSpeed(e.target.value as NarrationSpeed)}
                  className="bg-transparent font-semibold text-white cursor-pointer"
                >
                  <option value="fast" className="bg-slate-900">Fast</option>
                  <option value="normal" className="bg-slate-900">Normal</option>
                  <option value="dramatic" className="bg-slate-900">Dramatic</option>
                </select>
              </label>

              {/* Master Sound Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  soundEngine.setEnabled(next);
                }}
                aria-label={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
                aria-pressed={soundEnabled}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Reduced Motion Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !reducedMotion;
                  setReducedMotion(next);
                  sceneRef.current?.setReducedMotion(next);
                }}
                aria-pressed={reducedMotion}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  reducedMotion
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {reducedMotion ? 'Motion: Reduced' : 'Motion: Full'}
              </button>

              {/* Regret Report Button */}
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Regret Report</span>
              </button>

              {/* Pause Button */}
              <button
                type="button"
                onClick={() => setShellState(shellState === 'paused' ? 'playing' : 'paused')}
                aria-label="Pause Game"
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Voices & Piece Sound Studio Popover */}
          {showVoiceStudio && (
            <div
              role="dialog"
              aria-label="Voices and Piece Sound Studio"
              className="fixed top-24 left-3 z-30 w-[360px] sm:w-[410px] bg-[#0d121d]/96 border border-[#d4af37]/60 rounded-xl p-4 shadow-2xl pointer-events-auto"
            >
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-[#d4af37] flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5" />
                    <span>VOICES & PIECE SOUND STUDIO</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Synthesized WebAudio foley & multi-persona speech
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceStudio(false)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Voice Persona Selector */}
              <div className="mb-3.5">
                <div className="text-[11px] font-bold tracking-wider text-slate-300 mb-1.5">
                  SELECT VOICE PERSONA
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(VOICE_PROFILE_LABELS) as VoiceProfile[]).map((prof) => {
                    const info = VOICE_PROFILE_LABELS[prof];
                    const active = voiceProfile === prof;
                    return (
                      <button
                        key={prof}
                        type="button"
                        onClick={() => {
                          setVoiceProfile(prof);
                          soundEngine.setVoiceProfile(prof);
                          if (cards[0]) {
                            soundEngine.speakRegretCard(cards[0], cards[0].hindsight, narrationSpeed);
                          } else {
                            soundEngine.auditionPiece(prof === 'royal_court' ? 'q' : 'k');
                          }
                        }}
                        className={`text-left p-2 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#d4af37]/20 border-[#d4af37] text-white'
                            : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-bold text-[#e2c778]">{info.name}</div>
                        <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          {info.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Piece Voice Callout Toggle */}
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-900/90 border border-slate-800 mb-3.5">
                <span className="text-xs text-slate-200 font-medium">
                  Speak Piece Callouts on Move
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !pieceVoiceEnabled;
                    setPieceVoiceEnabled(next);
                    soundEngine.setPieceVoiceEnabled(next);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                    pieceVoiceEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {pieceVoiceEnabled ? 'Enabled' : 'Muted'}
                </button>
              </div>

              {/* Audition All 6 Piece Sound Signatures & Voices */}
              <div>
                <div className="text-[11px] font-bold tracking-wider text-slate-300 mb-1.5">
                  AUDITION PIECE SOUNDS & VOICES (CLICK ANY PIECE)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { p: 'p', glyph: '♙' },
                      { p: 'n', glyph: '♘' },
                      { p: 'b', glyph: '♗' },
                      { p: 'r', glyph: '♜' },
                      { p: 'q', glyph: '♕' },
                      { p: 'k', glyph: '♔' },
                    ] as { p: PieceSymbol; glyph: string }[]
                  ).map(({ p, glyph }) => {
                    const prof = PIECE_AUDIO_PROFILES[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => soundEngine.auditionPiece(p)}
                        className="flex flex-col items-start p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-[#d4af37]/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <span className="text-base text-[#d4af37]">{glyph}</span>
                          <span>{prof.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{prof.role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bottom-Left Accessible Move Bar & Optional 2D Interactive Mini-Board */}
          <div
            className="fixed bottom-14 md:bottom-4 left-3 z-20 max-w-full md:max-w-[calc(100vw-450px)] pointer-events-auto flex flex-col gap-2"
            role="region"
            aria-label="Accessible Chess Move Controls"
          >
            {show2DBoard && board2DGrid.length === 8 && (
              <div
                className="bg-[#0d121d]/96 border border-[#d4af37]/50 rounded-xl p-2.5 shadow-2xl w-fit"
                aria-label="Interactive 2D Chessboard"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#e2c778] mb-1.5 px-0.5">
                  <span>2D TACTICAL BOARD (CLICK SQUARES)</span>
                  <button
                    type="button"
                    onClick={() => setShow2DBoard(false)}
                    className="text-slate-400 hover:text-white text-xs cursor-pointer"
                  >
                    Hide
                  </button>
                </div>
                <div className="grid grid-cols-8 border border-[#d4af37]/40 rounded overflow-hidden">
                  {board2DGrid.map((row, rIdx) =>
                    row.map((cell, cIdx) => {
                      const fileIdx = humanColor === 'w' ? cIdx : 7 - cIdx;
                      const rankIdx = humanColor === 'w' ? 8 - rIdx : rIdx + 1;
                      const sq = `${String.fromCharCode(97 + fileIdx)}${rankIdx}` as Square;
                      const isLight = (rIdx + cIdx) % 2 === 0;
                      const isSelected = selectedSquare === sq;
                      const isLegal = legalTargets.includes(sq);
                      const isLast = lastMove?.from === sq || lastMove?.to === sq;
                      const glyphMap: Record<string, string> = {
                        wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
                        bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
                      };
                      const glyph = cell ? glyphMap[`${cell.color}${cell.type}`] : '';
                      return (
                        <button
                          key={sq}
                          type="button"
                          onClick={() => handleSquareClick(sq)}
                          aria-label={`Square ${sq}${cell ? ` ${cell.color === 'w' ? 'White' : 'Black'} ${cell.type}` : ''}`}
                          className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-lg sm:text-xl relative cursor-pointer select-none ${
                            isSelected
                              ? 'bg-sky-500/80'
                              : isLast
                              ? 'bg-amber-500/60'
                              : isLight
                              ? 'bg-[#e8dfd1]'
                              : 'bg-[#425675]'
                          }`}
                        >
                          {isLegal && (
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400/90 ring-2 ring-slate-950/60" />
                          )}
                          {glyph && (
                            <span
                              className={
                                cell?.color === 'w'
                                  ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]'
                                  : 'text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.45)]'
                              }
                            >
                              {glyph}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="bg-[#0d121d]/94 border border-slate-700/80 rounded-xl p-2.5 shadow-xl">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-[#e2c778] whitespace-nowrap">
                  {gameStatus.subtitle}
                </span>
                {selectedSquare && (
                  <span className="text-xs font-mono text-sky-300">
                    Selected: {selectedSquare.toUpperCase()}
                  </span>
                )}
                {moveError && (
                  <span className="text-xs text-rose-400 font-medium" role="alert">
                    {moveError}
                  </span>
                )}
              </div>

              {/* Algebraic Move Form + Quick Move Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!sanInput.trim()) return;
                    if (executeHumanMove(sanInput.trim())) {
                      setSanInput('');
                    }
                  }}
                  className="flex items-center gap-1.5"
                >
                  <label htmlFor="san-move-input" className="sr-only">
                    Enter Chess Move (SAN or coordinates like e4, Nf3, e2e4)
                  </label>
                  <input
                    id="san-move-input"
                    type="text"
                    value={sanInput}
                    onChange={(e) => setSanInput(e.target.value)}
                    placeholder="Type move (e.g. e4, Nf3)..."
                    disabled={thinking.isThinking || gameStatus.isOver}
                    className="w-40 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={thinking.isThinking || gameStatus.isOver}
                    className="px-3 py-1 rounded bg-[#d4af37] hover:bg-[#e5c349] disabled:opacity-40 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Play Move
                  </button>
                </form>

                {/* Quick Legal Move Buttons for Keyboard / Screen Reader / One-Click Play */}
                {gameStatus.turn === humanColor && !gameStatus.isOver && (
                  <div
                    className="flex items-center gap-1 overflow-x-auto max-w-[360px] sm:max-w-[460px] py-0.5"
                    role="group"
                    aria-label="Quick Legal Moves"
                  >
                    {currentLegalMoves.slice(0, 8).map((m) => (
                      <button
                        key={m.san}
                        type="button"
                        disabled={thinking.isThinking}
                        onClick={() => executeHumanMove(m.san)}
                        aria-label={`Play move ${m.san}`}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {m.san}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pawn Promotion Picker Modal */}
          {pendingPromotion && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-label="Choose Promotion Piece"
            >
              <div className="bg-[#0d121d] border border-[#d4af37] rounded-xl p-5 shadow-2xl text-center max-w-sm w-full">
                <h3 className="text-base font-bold text-white mb-1 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <span>Promote Pawn on {pendingPromotion.to.toUpperCase()}</span>
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Choose a piece (Queen is default):
                </p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(
                    [
                      { p: 'q', label: 'Queen' },
                      { p: 'r', label: 'Rook' },
                      { p: 'b', label: 'Bishop' },
                      { p: 'n', label: 'Knight' },
                    ] as { p: PieceSymbol; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.p}
                      type="button"
                      onClick={() =>
                        executeHumanMove({
                          from: pendingPromotion.from,
                          to: pendingPromotion.to,
                          promotion: item.p,
                        })
                      }
                      className={`py-2.5 px-2 rounded-lg text-xs font-bold cursor-pointer ${
                        item.p === 'q'
                          ? 'bg-[#d4af37] text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Right/Bottom Collapsible Regret Journal */}
          <RegretJournal
            cards={cards}
            activeCardId={activeCardId}
            thinking={thinking}
            botMood={botMood}
            botConfidence={botConfidence}
            isCollapsed={isJournalCollapsed}
            onToggleCollapse={() => setIsJournalCollapsed((c) => !c)}
            onSelectCardWhy={handleSelectCardWhy}
            onSpeakCard={handleSpeakCard}
            isSpeaking={isSpeaking}
            onStopSpeaking={() => soundEngine.stopSpeech()}
            onStartWhatIf={handleStartWhatIf}
            rewindState={rewindState}
            onStepRewind={handleStepRewind}
            onExitRewind={handleExitRewind}
          />
        </>
      )}

      {/* Pause Modal */}
      {shellState === 'paused' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Game Paused"
        >
          <div className="bg-[#0c111d] border border-[#d4af37]/50 rounded-xl p-6 max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">MATCH PAUSED</h2>
            <p className="text-xs text-slate-400 mb-5">
              Turns played: <span className="font-mono tabular-nums text-white">{cards.length}</span> · Bot Confidence:{' '}
              <span className="font-mono tabular-nums text-[#e2c778]">{botConfidence}/100</span>
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShellState('playing')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#d4af37] hover:bg-[#e5c349] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>Resume Match</span>
              </button>
              <button
                type="button"
                onClick={() => handleNewGame(humanColor)}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer"
              >
                Restart Match
              </button>
              <button
                type="button"
                onClick={() => {
                  setShellState('title');
                  setCameraPreset('title');
                  sceneRef.current?.setCameraPreset('title', false);
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Game / On-Demand Regret Report Modal */}
      {showReportModal && (
        <RegretReportModal
          outcomeTitle={gameStatus.title}
          outcomeSubtitle={gameStatus.subtitle}
          cards={cards}
          onPlayAgain={() => handleNewGame(humanColor)}
          onCloseInspect={() => setShowReportModal(false)}
        />
      )}
    </main>
  );
}
