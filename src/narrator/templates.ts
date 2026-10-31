/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BotMood, HindsightType } from '../engine/types';

export interface MoveTemplateVars {
  moveSan: string;
  reason: string; // e.g. "captures knight on f6"
  evalPawns: string; // e.g. "+1.40"
  replySan: string; // e.g. "Nxd4"
  pvLine: string; // e.g. "Nf6 Nc3 d5"
}

export interface HindsightTemplateVars {
  humanMoveSan: string;
  botMoveSan: string;
  betterMoveSan: string;
  betterReason: string;
  evalDropPawns: string;
  evalGainPawns: string;
  predictedReplySan: string;
}

export const MOVE_TEMPLATES_BY_MOOD: Record<BotMood, ((v: MoveTemplateVars) => string)[]> = {
  confident: [
    (v) => `I play ${v.moveSan}—it ${v.reason.toLowerCase()}. Try surviving that.`,
    (v) => `${v.moveSan} hits the board and ${v.reason.toLowerCase()}. My position gleams at ${v.evalPawns}.`,
    (v) => `Boom: ${v.moveSan}. It ${v.reason.toLowerCase()} and keeps my grip tight.`,
    (v) => `No hesitation—${v.moveSan} ${v.reason.toLowerCase()}. You are running out of squares.`,
    (v) => `I lock in ${v.moveSan} because it ${v.reason.toLowerCase()}. Textbook domination.`,
    (v) => `${v.moveSan} is the cleanest strike: it ${v.reason.toLowerCase()}.`,
    (v) => `Watch closely: ${v.moveSan} ${v.reason.toLowerCase()} while pushing my edge to ${v.evalPawns}.`,
    (v) => `I march forward with ${v.moveSan}—it ${v.reason.toLowerCase()}.`,
  ],
  calm: [
    (v) => `I choose ${v.moveSan}—it ${v.reason.toLowerCase()}. Solid and measured.`,
    (v) => `${v.moveSan} feels right here: it ${v.reason.toLowerCase()}.`,
    (v) => `Settling on ${v.moveSan}, which ${v.reason.toLowerCase()}.`,
    (v) => `I commit to ${v.moveSan}. It ${v.reason.toLowerCase()} without overextending.`,
    (v) => `${v.moveSan} is my pick—it ${v.reason.toLowerCase()} and keeps the balance at ${v.evalPawns}.`,
    (v) => `Quietly playing ${v.moveSan}: it ${v.reason.toLowerCase()}.`,
    (v) => `After checking the lines, ${v.moveSan} ${v.reason.toLowerCase()}.`,
    (v) => `Let's go with ${v.moveSan}—it ${v.reason.toLowerCase()}.`,
  ],
  nervous: [
    (v) => `My palms are sweating, so I play ${v.moveSan}—at least it ${v.reason.toLowerCase()}.`,
    (v) => `Okay, deep breath: ${v.moveSan} ${v.reason.toLowerCase()}. Please don't punish me.`,
    (v) => `Everything looks sharp, so I hide behind ${v.moveSan}, which ${v.reason.toLowerCase()}.`,
    (v) => `I'm clinging to ${v.moveSan} because it ${v.reason.toLowerCase()}.`,
    (v) => `Shaky choice, maybe, but ${v.moveSan} ${v.reason.toLowerCase()}.`,
    (v) => `I'll try ${v.moveSan}—it ${v.reason.toLowerCase()} while I patch my defenses.`,
    (v) => `Hoping ${v.moveSan} holds the roof up; it ${v.reason.toLowerCase()}.`,
    (v) => `Under pressure, I find ${v.moveSan}—it ${v.reason.toLowerCase()}.`,
  ],
  panicking: [
    (v) => `Sirens blaring! I scramble with ${v.moveSan} because it ${v.reason.toLowerCase()}.`,
    (v) => `My king is hyperventilating—${v.moveSan} ${v.reason.toLowerCase()}!`,
    (v) => `Desperate times: ${v.moveSan} ${v.reason.toLowerCase()}. Have mercy!`,
    (v) => `The board is on fire, so I throw out ${v.moveSan}—it ${v.reason.toLowerCase()}.`,
    (v) => `I'm hanging by a thread at ${v.evalPawns}! ${v.moveSan} ${v.reason.toLowerCase()}.`,
    (v) => `Emergency move ${v.moveSan}! At least it ${v.reason.toLowerCase()}.`,
    (v) => `Don't look at the eval! I play ${v.moveSan}, which ${v.reason.toLowerCase()}.`,
    (v) => `Pure survival mode: ${v.moveSan} ${v.reason.toLowerCase()}.`,
  ],
};

export const EXPECTED_TEMPLATES: ((v: MoveTemplateVars) => string)[] = [
  (v) => `I expect ${v.replySan} next (line: ${v.pvLine}), putting my eval at ${v.evalPawns}.`,
  (v) => `My calculation banks on you playing ${v.replySan} (${v.pvLine}) for ${v.evalPawns}.`,
  (v) => `If you play the best reply ${v.replySan}, the line ${v.pvLine} leaves me at ${v.evalPawns}.`,
  (v) => `I've mapped out ${v.replySan} as your strongest answer (${v.pvLine}), scoring ${v.evalPawns}.`,
  (v) => `Prepared for ${v.replySan}—following ${v.pvLine}, I judge this position ${v.evalPawns}.`,
  (v) => `Counting on ${v.replySan} from you (${v.pvLine}) with an evaluation of ${v.evalPawns}.`,
  (v) => `Your sharpest test is ${v.replySan}; after ${v.pvLine} I stand at ${v.evalPawns}.`,
  (v) => `Reading ${v.replySan} on the horizon (${v.pvLine}), holding ${v.evalPawns}.`,
];

export const HINDSIGHT_TEMPLATES: Record<HindsightType, ((v: HindsightTemplateVars) => string)[]> = {
  REGRET: [
    (v) => `Ugh, your ${v.humanMoveSan} sank my eval by ${v.evalDropPawns} pawns! I should have played ${v.betterMoveSan}, which ${v.betterReason}.`,
    (v) => `Instant regret! ${v.humanMoveSan} shredded my plan (-${v.evalDropPawns} pawns). Why didn't I play ${v.betterMoveSan} (${v.betterReason})?`,
    (v) => `I completely underestimated ${v.humanMoveSan}, losing ${v.evalDropPawns} pawns. ${v.betterMoveSan} was right there—it ${v.betterReason}!`,
    (v) => `Pain! After ${v.humanMoveSan} my position slumped by ${v.evalDropPawns} pawns. I wish I had chosen ${v.betterMoveSan} (${v.betterReason}).`,
    (v) => `My horizon was too shallow for ${v.humanMoveSan} (-${v.evalDropPawns} pawns). ${v.betterMoveSan} would have saved me: it ${v.betterReason}.`,
    (v) => `I'm kicking myself over ${v.botMoveSan}! Your ${v.humanMoveSan} cost me ${v.evalDropPawns} pawns—${v.betterMoveSan} (${v.betterReason}) was the truth.`,
    (v) => `Cold sweat: ${v.humanMoveSan} knocked ${v.evalDropPawns} pawns off my score. I needed ${v.betterMoveSan}, which ${v.betterReason}.`,
    (v) => `Disaster after ${v.humanMoveSan} (-${v.evalDropPawns} pawns). I passed up ${v.betterMoveSan} (${v.betterReason}) and now I pay the price.`,
  ],
  GIFT: [
    (v) => `A gift! Your ${v.humanMoveSan} handed me +${v.evalGainPawns} pawns. You missed ${v.predictedReplySan}, and now ${v.betterMoveSan} ${v.betterReason.toLowerCase()}.`,
    (v) => `Thank you kindly! ${v.humanMoveSan} drops ${v.evalGainPawns} pawns—you needed ${v.predictedReplySan}, because now ${v.betterMoveSan} ${v.betterReason.toLowerCase()}.`,
    (v) => `You blinked! ${v.humanMoveSan} blunders +${v.evalGainPawns} pawns my way; ${v.predictedReplySan} was required to stop ${v.betterMoveSan} (${v.betterReason.toLowerCase()}).`,
    (v) => `Christmas came early: ${v.humanMoveSan} surrenders ${v.evalGainPawns} pawns! Skipping ${v.predictedReplySan} lets me unleash ${v.betterMoveSan}, which ${v.betterReason.toLowerCase()}.`,
    (v) => `Oh, you missed ${v.predictedReplySan}! Your ${v.humanMoveSan} boosts my eval by +${v.evalGainPawns} pawns as ${v.betterMoveSan} ${v.betterReason.toLowerCase()}.`,
    (v) => `That ${v.humanMoveSan} was a ${v.evalGainPawns}-pawn generosity! Without ${v.predictedReplySan}, my ${v.betterMoveSan} ${v.betterReason.toLowerCase()}.`,
    (v) => `I'll take that! ${v.humanMoveSan} leaks ${v.evalGainPawns} pawns compared to ${v.predictedReplySan}, giving me ${v.betterMoveSan} (${v.betterReason.toLowerCase()}).`,
    (v) => `Blunder alert: ${v.humanMoveSan} costs you ${v.evalGainPawns} pawns! You overlooked ${v.predictedReplySan}, walking straight into ${v.betterMoveSan} (${v.betterReason.toLowerCase()}).`,
  ],
  VINDICATED: [
    (v) => `Called it! You played ${v.humanMoveSan} word-for-word from my principal variation.`,
    (v) => `Vindicated! ${v.humanMoveSan} was the exact reply I circled in my notebook.`,
    (v) => `Like clockwork: you answered ${v.humanMoveSan} just as I predicted.`,
    (v) => `You walked right down my main line with ${v.humanMoveSan}. I read you like an open book.`,
    (v) => `Zero surprises—${v.humanMoveSan} matches my top predicted reply move for move.`,
    (v) => `Aha! ${v.humanMoveSan} confirms my calculation down to the centipawn.`,
    (v) => `Right on script: ${v.humanMoveSan} was my #1 expected response.`,
    (v) => `I foresaw ${v.humanMoveSan} from four plies away. Everything is proceeding to plan.`,
  ],
  SHRUG: [
    (v) => `You played ${v.humanMoveSan} instead of ${v.predictedReplySan}, shifting the eval by a mere ${v.evalDropPawns} pawns. Fair enough.`,
    (v) => `${v.humanMoveSan} is a playable sideline—barely nudges the needle (${v.evalDropPawns} pawns).`,
    (v) => `A quiet detour with ${v.humanMoveSan} (${v.evalDropPawns} pawns diff). Nothing to panic about.`,
    (v) => `Not ${v.predictedReplySan}, but ${v.humanMoveSan} keeps the tension roughly unchanged (${v.evalDropPawns} pawns).`,
    (v) => `I shrug at ${v.humanMoveSan}: the evaluation only moved ${v.evalDropPawns} pawns from my forecast.`,
    (v) => `${v.humanMoveSan} sidesteps ${v.predictedReplySan} with almost identical balance (${v.evalDropPawns} pawns).`,
    (v) => `Interesting choice with ${v.humanMoveSan}—only a ${v.evalDropPawns}-pawn ripple in the position.`,
    (v) => `Your ${v.humanMoveSan} keeps things steady (${v.evalDropPawns} pawns vs my prediction). Play on!`,
  ],
};
