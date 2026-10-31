/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeHindsightAnalysis, searchRootPosition } from './search';
import { CandidateMove, HindsightAnalysis, SearchOptions, SearchResult } from './types';

export type WorkerRequest =
  | {
      type: 'SEARCH_AND_HINDSIGHT';
      requestId: number;
      fen: string;
      options: SearchOptions;
      hindsightRequest?: {
        botColor: 'w' | 'b';
        botOriginalDepth: number;
        botMoveSan: string;
        botPredictedEvalFromBotPerspective: number;
        botPredictedHumanReplySan?: string;
        humanActualMoveSan: string;
        botRunnerUps: CandidateMove[];
      };
    };

export type WorkerResponse =
  | {
      type: 'PROGRESS';
      requestId: number;
      depth: number;
      currentBestSan: string;
      nodes: number;
    }
  | {
      type: 'RESULT';
      requestId: number;
      searchResult: SearchResult;
      hindsight?: HindsightAnalysis;
    }
  | {
      type: 'ERROR';
      requestId: number;
      message: string;
    };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'SEARCH_AND_HINDSIGHT') {
    try {
      let hindsight: HindsightAnalysis | undefined;
      if (msg.hindsightRequest) {
        hindsight = computeHindsightAnalysis({
          fenAfterHumanReply: msg.fen,
          ...msg.hindsightRequest,
        });
      }

      const searchResult = searchRootPosition(
        msg.fen,
        msg.options,
        (depth, currentBestSan, nodes) => {
          const progressMsg: WorkerResponse = {
            type: 'PROGRESS',
            requestId: msg.requestId,
            depth,
            currentBestSan,
            nodes,
          };
          self.postMessage(progressMsg);
        }
      );

      const response: WorkerResponse = {
        type: 'RESULT',
        requestId: msg.requestId,
        searchResult,
        hindsight,
      };
      self.postMessage(response);
    } catch (err) {
      const errorMsg: WorkerResponse = {
        type: 'ERROR',
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(errorMsg);
    }
  }
};
