/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PieceSymbol } from 'chess.js';
import { BotMood, HindsightAnalysis } from '../engine/types';
import { RegretCard } from '../narrator/narrator';

export type VoiceProfile = 'dramatist' | 'royal_court' | 'cyber_tactician' | 'whisper_oracle';

export const VOICE_PROFILE_LABELS: Record<VoiceProfile, { name: string; subtitle: string }> = {
  dramatist: {
    name: 'Grandmaster Dramatist',
    subtitle: 'Theatrical bot voice that sweats, gloats, and panics with eval swings',
  },
  royal_court: {
    name: 'Royal Court (6 Piece Voices)',
    subtitle: 'Each piece type speaks in its own distinct pitch, cadence, and persona',
  },
  cyber_tactician: {
    name: 'Cyber Tactician',
    subtitle: 'Rapid analytical voice paired with synthesized vocoder formant tones',
  },
  whisper_oracle: {
    name: 'Mystic Oracle',
    subtitle: 'Deep, resonant atmospheric voice with crystalline harmonic undertones',
  },
};

export const PIECE_AUDIO_PROFILES: Record<
  PieceSymbol,
  {
    title: string;
    role: string;
    selectPitchHz: number;
    movePitchHz: number;
    voicePitch: number;
    voiceRate: number;
    formantF1: number;
    formantF2: number;
    sampleLine: string;
  }
> = {
  p: {
    title: 'Pawn',
    role: 'Eager Vanguard',
    selectPitchHz: 340,
    movePitchHz: 210,
    voicePitch: 1.26,
    voiceRate: 1.14,
    formantF1: 680,
    formantF2: 1220,
    sampleLine: 'Vanguard Pawn reporting! One square closer to glory!',
  },
  n: {
    title: 'Knight',
    role: 'Cavalry Charger',
    selectPitchHz: 460,
    movePitchHz: 260,
    voicePitch: 1.08,
    voiceRate: 1.12,
    formantF1: 580,
    formantF2: 1580,
    sampleLine: 'Cavalry Knight leaping over the ramparts! Watch the fork!',
  },
  b: {
    title: 'Bishop',
    role: 'Diagonal Mystic',
    selectPitchHz: 528,
    movePitchHz: 396,
    voicePitch: 1.15,
    voiceRate: 0.96,
    formantF1: 420,
    formantF2: 1950,
    sampleLine: 'Bishop gliding along the long diagonal. Precision from afar.',
  },
  r: {
    title: 'Rook',
    role: 'Stone Fortress',
    selectPitchHz: 110,
    movePitchHz: 78,
    voicePitch: 0.68,
    voiceRate: 0.88,
    formantF1: 360,
    formantF2: 880,
    sampleLine: 'Heavy Rook rumbling down the open file! Clear the path!',
  },
  q: {
    title: 'Queen',
    role: 'Imperial Sovereign',
    selectPitchHz: 440,
    movePitchHz: 554.37,
    voicePitch: 1.18,
    voiceRate: 1.02,
    formantF1: 520,
    formantF2: 2150,
    sampleLine: 'The Queen commands every file, rank, and diagonal on this board.',
  },
  k: {
    title: 'King',
    role: 'Crowned Monarch',
    selectPitchHz: 146.83,
    movePitchHz: 110,
    voicePitch: 0.8,
    voiceRate: 0.92,
    formantF1: 410,
    formantF2: 1050,
    sampleLine: 'Guard the throne! One miscalculation and my crown topples.',
  },
};

/**
 * Converts chess algebraic notation inside narration strings into natural spoken English
 * so browser SpeechSynthesis reads moves fluidly instead of spelling raw symbols.
 */
export function formatChessSpeech(rawText: string): string {
  return rawText
    .replace(/\bO-O-O\b/g, 'castles queenside')
    .replace(/\bO-O\b/g, 'castles kingside')
    // Piece captures with checkmate/check e.g. Qxd5#, Nxf7+
    .replace(
      /\b([KQRBN])([a-h1-8]?)x([a-h][1-8])([+#]?)\b/g,
      (_, piece: string, disamb: string, sq: string, chk: string) => {
        const names: Record<string, string> = {
          K: 'King',
          Q: 'Queen',
          R: 'Rook',
          B: 'Bishop',
          N: 'Knight',
        };
        const suffix = chk === '#' ? ' checkmate' : chk === '+' ? ' check' : '';
        const fromPart = disamb ? ` ${disamb}` : '';
        return `${names[piece] || piece}${fromPart} takes ${sq[0]} ${sq[1]}${suffix}`;
      }
    )
    // Pawn captures e.g. exd5+
    .replace(/\b([a-h])x([a-h][1-8])([+#]?)\b/g, (_, file: string, sq: string, chk: string) => {
      const suffix = chk === '#' ? ' checkmate' : chk === '+' ? ' check' : '';
      return `${file} takes ${sq[0]} ${sq[1]}${suffix}`;
    })
    // Standard piece moves e.g. Nf6, Bc4+, Qd8#
    .replace(
      /\b([KQRBN])([a-h1-8]?)([a-h][1-8])([+#]?)\b/g,
      (_, piece: string, disamb: string, sq: string, chk: string) => {
        const names: Record<string, string> = {
          K: 'King',
          Q: 'Queen',
          R: 'Rook',
          B: 'Bishop',
          N: 'Knight',
        };
        const suffix = chk === '#' ? ' checkmate' : chk === '+' ? ' check' : '';
        const fromPart = disamb ? ` ${disamb}` : '';
        return `${names[piece] || piece}${fromPart} to ${sq[0]} ${sq[1]}${suffix}`;
      }
    )
    // Pawn moves e.g. e4, d5+
    .replace(/\b([a-h][1-8])([+#])\b/g, (_, sq: string, chk: string) => {
      const suffix = chk === '#' ? ' checkmate' : ' check';
      return `${sq[0]} ${sq[1]}${suffix}`;
    })
    // Eval scores e.g. +0.34p, -1.20p
    .replace(/([+-]\d+\.\d+)p\b/g, (_, val: string) => {
      const spokenSign = val.startsWith('-') ? 'minus ' : 'plus ';
      return `${spokenSign}${val.slice(1)} pawns`;
    })
    .replace(/—/g, ', ');
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private voiceEnabled = true;
  private pieceVoiceEnabled = true;
  private voiceProfile: VoiceProfile = 'dramatist';
  private speakingCallback?: (isSpeaking: boolean, text?: string) => void;

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopSpeech();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVoiceEnabled(enabled: boolean) {
    this.voiceEnabled = enabled;
    if (!enabled) {
      this.stopSpeech();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setPieceVoiceEnabled(enabled: boolean) {
    this.pieceVoiceEnabled = enabled;
  }

  public isPieceVoiceEnabled(): boolean {
    return this.pieceVoiceEnabled;
  }

  public setVoiceProfile(profile: VoiceProfile) {
    this.voiceProfile = profile;
  }

  public getVoiceProfile(): VoiceProfile {
    return this.voiceProfile;
  }

  public onSpeakingStateChange(cb: (isSpeaking: boolean, text?: string) => void) {
    this.speakingCallback = cb;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const bufferSize = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Plays a piece-specific tactile & musical signature when a piece is clicked/selected.
   */
  public playPieceSelect(piece: PieceSymbol, isWhite = true) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const profile = PIECE_AUDIO_PROFILES[piece] || PIECE_AUDIO_PROFILES.p;
    const colorShift = isWhite ? 1.05 : 0.94;

    if (piece === 'p') {
      // Crisp soldier double-click tap
      [0, 0.045].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((idx === 0 ? 340 : 490) * colorShift, now + offset);
        osc.frequency.exponentialRampToValueAtTime(140, now + offset + 0.04);
        g.gain.setValueAtTime(0.16, now + offset);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.045);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.05);
      });
    } else if (piece === 'n') {
      // Cavalry metallic spur/bridle clink + hoof ready tap
      [1180, 1760].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * colorShift, now + i * 0.025);
        g.gain.setValueAtTime(0.11, now + i * 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.025 + 0.09);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.025);
        osc.stop(now + i * 0.025 + 0.1);
      });
    } else if (piece === 'b') {
      // Mystic harmonic fifth shimmer
      [528, 792].forEach((freq) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * colorShift, now);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      });
    } else if (piece === 'r') {
      // Heavy granite fortress wake-up thud
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(95 * colorShift, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
      g.gain.setValueAtTime(0.24, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (piece === 'q') {
      // Imperial major-7th crystal chord
      [440, 554.37, 659.25, 830.61].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.02;
        osc.frequency.setValueAtTime(freq * colorShift, t);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } else {
      // King: Deep royal timpani + golden scepter chime
      const sub = ctx.createOscillator();
      const sg = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(profile.selectPitchHz * colorShift, now);
      sub.frequency.exponentialRampToValueAtTime(65, now + 0.2);
      sg.gain.setValueAtTime(0.22, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      sub.connect(sg);
      sg.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.23);
    }
  }

  /**
   * Plays a rich piece-specific movement sound (galloping hooves for Knight,
   * diagonal wind-chime for Bishop, stone grind for Rook, royal glissando for Queen, etc.).
   */
  public playPieceMove(piece: PieceSymbol = 'p', isBot = false, san?: string) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const toneScale = isBot ? 0.92 : 1.04;

    if (san === 'O-O' || san === 'O-O-O') {
      this.playCastle();
      return;
    }

    if (piece === 'n') {
      // Knight: 3-beat galloping hoof cadence + leap whoosh + marble landing
      const hoofTimes = [0, 0.055, 0.11, 0.2];
      hoofTimes.forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = now + offset;
        const isLanding = idx === 3;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((isLanding ? 185 : 250 + idx * 30) * toneScale, t);
        osc.frequency.exponentialRampToValueAtTime(isLanding ? 55 : 95, t + 0.065);
        g.gain.setValueAtTime(isLanding ? 0.28 : 0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.075);
      });
    } else if (piece === 'b') {
      // Bishop: Filtered diagonal wind-sweep + harmonic placement chime
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(6, now);
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(1650, now + 0.11);
      filter.frequency.exponentialRampToValueAtTime(580, now + 0.22);

      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.18, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.24);

      this.playMarblePlacementThock(ctx, now + 0.14, 210 * toneScale, 0.2);
    } else if (piece === 'r') {
      // Rook: Heavy stone-on-marble sliding rumble + seismic fortress lock
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, now);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.24, now);
      ng.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.19);

      // Seismic bass lock
      this.playMarblePlacementThock(ctx, now + 0.15, 125 * toneScale, 0.34);
    } else if (piece === 'q') {
      // Queen: Imperial harmonic shimmer + authoritative placement chord
      const chord = [440, 554.37, 659.25];
      chord.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = now + i * 0.03;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * toneScale, t);
        osc.frequency.exponentialRampToValueAtTime(f * toneScale * 1.12, t + 0.18);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.21);
      });
      this.playMarblePlacementThock(ctx, now + 0.12, 175 * toneScale, 0.26);
    } else if (piece === 'k') {
      // King: Solemn royal step + warm brass fifth
      [196, 293.66].forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f * toneScale, now);
        g.gain.setValueAtTime(0.11, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      });
      this.playMarblePlacementThock(ctx, now + 0.05, 135 * toneScale, 0.28);
    } else {
      // Pawn: Crisp vanguard double-step + marble snap
      this.playMarblePlacementThock(ctx, now, 225 * toneScale, 0.14);
      this.playMarblePlacementThock(ctx, now + 0.06, 175 * toneScale, 0.24);
    }

    // Play subtle synthesized vocal formant murmur for the piece
    this.playFormantSyllables(piece, isBot ? 0.05 : 0.065);
  }

  public playMove(isBot = false, piece: PieceSymbol = 'p', san?: string) {
    this.playPieceMove(piece, isBot, san);
  }

  private playMarblePlacementThock(
    ctx: AudioContext,
    startTime: number,
    baseFreq: number,
    volume: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const detune = (Math.random() - 0.5) * 12;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq + detune, startTime);
    osc.frequency.exponentialRampToValueAtTime(48, startTime + 0.095);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.105);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.11);
  }

  public playCastle() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Dual mechanical drawbridge lock: King step + Rook slide + brass bolt
    this.playMarblePlacementThock(ctx, now, 150, 0.26);
    this.playMarblePlacementThock(ctx, now + 0.11, 120, 0.3);
    [392, 587.33].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + 0.16 + i * 0.04;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  public playPromotion() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Celestial ascending fanfare
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + idx * 0.055;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.29);
    });
  }

  public playCapture(attackerPiece: PieceSymbol = 'q', capturedPiece: PieceSymbol = 'p') {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Play attacker piece's signature strike
    this.playPieceSelect(attackerPiece, true);

    // 2. Heavy impact sub-bass shockwave (deeper for heavier captured pieces)
    const weightMap: Record<PieceSymbol, number> = {
      p: 150,
      n: 125,
      b: 125,
      r: 95,
      q: 80,
      k: 70,
    };
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(weightMap[capturedPiece] || 135, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.26);
    subGain.gain.setValueAtTime(0.4, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.29);

    // 3. Crystalline shard shatter burst (5 staggered glass/obsidian shard pings)
    const freqs = [880, 1240, 1580, 1960, 2340];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + idx * 0.022;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 90, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.15);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playCheck() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // Sharp brass alarm triad
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.065;
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, t);
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playRegretMoment() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Dramatic descending minor triad (A4 -> F4 -> D4 -> A3)
    const notes = [440, 349.23, 293.66, 220];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.11;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 0.95, t + 0.26);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playGiftMoment() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Smug ascending major arpeggio (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.065;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playCheckmate() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /**
   * Synthesizes a short WebAudio vowel-formant vocal phrase (F1 + F2 bandpass-filtered glottal source)
   * so pieces and bot moods have audible vocal character even without external audio assets.
   */
  public playFormantSyllables(piece: PieceSymbol = 'p', gainLevel = 0.08) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const profile = PIECE_AUDIO_PROFILES[piece] || PIECE_AUDIO_PROFILES.p;
    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(profile.movePitchHz * 0.65, now);
    carrier.frequency.linearRampToValueAtTime(profile.movePitchHz * 0.78, now + 0.09);
    carrier.frequency.linearRampToValueAtTime(profile.movePitchHz * 0.58, now + 0.18);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(profile.formantF1, now);
    f1.Q.setValueAtTime(5.5, now);

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(profile.formantF2, now);
    f2.Q.setValueAtTime(6.5, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(gainLevel, now + 0.025);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    carrier.connect(f1);
    carrier.connect(f2);
    f1.connect(masterGain);
    f2.connect(masterGain);
    masterGain.connect(ctx.destination);

    carrier.start(now);
    carrier.stop(now + 0.2);
  }

  public stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore if blocked
      }
    }
    this.speakingCallback?.(false);
  }

  /**
   * Speaks a short piece-specific callout when a piece moves or is auditioned in the Sound Studio.
   */
  public speakPieceCallout(
    piece: PieceSymbol,
    san: string,
    isCapture = false,
    isCheck = false,
    force = false
  ) {
    if (!this.enabled || (!this.pieceVoiceEnabled && !force)) return;
    const profile = PIECE_AUDIO_PROFILES[piece] || PIECE_AUDIO_PROFILES.p;
    const naturalMove = formatChessSpeech(san);
    const flair = isCheck
      ? 'Check to the monarch!'
      : isCapture
      ? 'Shattered!'
      : '';
    const line = `${profile.title}: ${naturalMove}. ${flair}`.trim();

    this.speakRawText(line, {
      pitch: profile.voicePitch,
      rate: profile.voiceRate,
      piece,
    });
  }

  /**
   * Auditions a specific piece's complete sound signature + character voice line.
   */
  public auditionPiece(piece: PieceSymbol) {
    if (!this.enabled) this.setEnabled(true);
    const profile = PIECE_AUDIO_PROFILES[piece];
    this.playPieceSelect(piece, true);
    window.setTimeout(() => {
      this.playPieceMove(piece, false);
    }, 140);
    this.speakRawText(profile.sampleLine, {
      pitch: profile.voicePitch,
      rate: profile.voiceRate,
      piece,
    });
  }

  /**
   * Speaks a Bot Regret Card out loud with mood-reactive and persona-reactive voice modulation.
   */
  public speakRegretCard(
    card: RegretCard,
    hindsight?: RegretCard['hindsight'],
    speedMode: 'fast' | 'normal' | 'dramatic' = 'normal'
  ) {
    if (!this.enabled || !this.voiceEnabled) return;

    const parts: string[] = [];
    if (hindsight && hindsight.type !== 'SHRUG') {
      parts.push(hindsight.narrativeText);
    }
    parts.push(card.theMoveText);
    parts.push(card.iExpectedText);
    if (card.almostPlayed.length > 0) {
      parts.push(`I almost played ${card.almostPlayed[0].rejectionLine}`);
    }

    const fullText = formatChessSpeech(parts.join(' '));

    // Determine piece moved from SAN first letter
    const firstChar = card.moveSan[0];
    const pieceMap: Record<string, PieceSymbol> = {
      K: 'k',
      Q: 'q',
      R: 'r',
      B: 'b',
      N: 'n',
    };
    const piece: PieceSymbol = pieceMap[firstChar] || 'p';

    const { pitch, rate } = this.computeVoiceParams(card.mood, piece, speedMode);
    this.playFormantSyllables(piece, 0.075);
    this.speakRawText(fullText, { pitch, rate, piece });
  }

  private computeVoiceParams(
    mood: BotMood,
    piece: PieceSymbol,
    speedMode: 'fast' | 'normal' | 'dramatic'
  ): { pitch: number; rate: number } {
    const speedMult = speedMode === 'fast' ? 1.18 : speedMode === 'dramatic' ? 0.92 : 1.03;

    if (this.voiceProfile === 'royal_court') {
      const p = PIECE_AUDIO_PROFILES[piece] || PIECE_AUDIO_PROFILES.p;
      return {
        pitch: p.voicePitch,
        rate: Math.max(0.75, Math.min(1.45, p.voiceRate * speedMult)),
      };
    }

    if (this.voiceProfile === 'cyber_tactician') {
      return {
        pitch: mood === 'panicking' ? 1.28 : 0.88,
        rate: Math.max(0.85, Math.min(1.5, 1.16 * speedMult)),
      };
    }

    if (this.voiceProfile === 'whisper_oracle') {
      return {
        pitch: 0.78,
        rate: Math.max(0.75, Math.min(1.25, 0.9 * speedMult)),
      };
    }

    // Default: 'dramatist' mood-reactive persona
    if (mood === 'confident') {
      return { pitch: 0.94, rate: 1.0 * speedMult };
    }
    if (mood === 'nervous') {
      return { pitch: 1.16, rate: 1.14 * speedMult };
    }
    if (mood === 'panicking') {
      return { pitch: 1.28, rate: 1.22 * speedMult };
    }
    return { pitch: 1.02, rate: 1.03 * speedMult };
  }

  private speakRawText(
    text: string,
    opts: { pitch: number; rate: number; piece?: PieceSymbol }
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = Math.max(0.5, Math.min(1.8, opts.pitch));
      utterance.rate = Math.max(0.7, Math.min(1.6, opts.rate));
      utterance.volume = 0.95;

      // Pick a clear English voice if available, varying slightly by voiceProfile
      const voices = window.speechSynthesis.getVoices();
      const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
      if (enVoices.length > 0) {
        if (this.voiceProfile === 'royal_court' && opts.piece) {
          const idxMap: Record<PieceSymbol, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
          utterance.voice = enVoices[idxMap[opts.piece] % enVoices.length];
        } else if (this.voiceProfile === 'whisper_oracle') {
          utterance.voice = enVoices[enVoices.length - 1];
        } else if (this.voiceProfile === 'cyber_tactician' && enVoices.length > 1) {
          utterance.voice = enVoices[1];
        } else {
          utterance.voice = enVoices[0];
        }
      }

      utterance.onstart = () => {
        this.speakingCallback?.(true, text);
      };
      utterance.onend = () => {
        this.speakingCallback?.(false);
      };
      utterance.onerror = () => {
        this.speakingCallback?.(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.speakingCallback?.(false);
    }
  }
}

export const soundEngine = new SoundEngine();
