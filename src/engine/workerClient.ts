/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeHindsightAnalysis, searchRootPosition } from './search';
import { CandidateMove, HindsightAnalysis, SearchOptions, SearchResult } from './types';
import { WorkerRequest, WorkerResponse } from './worker';

export interface ThinkingStatus {
  isThinking: boolean;
  depth: number;
  currentBestSan: string;
  nodes: number;
}

export class EngineWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<
    number,
    {
      resolve: (res: { searchResult: SearchResult; hindsight?: HindsightAnalysis }) => void;
      reject: (err: Error) => void;
      onProgress?: (status: ThinkingStatus) => void;
    }
  >();

  constructor() {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          const entry = this.pending.get(msg.requestId);
          if (!entry) return;

          if (msg.type === 'PROGRESS') {
            entry.onProgress?.({
              isThinking: true,
              depth: msg.depth,
              currentBestSan: msg.currentBestSan,
              nodes: msg.nodes,
            });
          } else if (msg.type === 'RESULT') {
            this.pending.delete(msg.requestId);
            entry.resolve({
              searchResult: msg.searchResult,
              hindsight: msg.hindsight,
            });
          } else if (msg.type === 'ERROR') {
            this.pending.delete(msg.requestId);
            entry.reject(new Error(msg.message));
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  public async searchAndHindsight(
    fen: string,
    options: SearchOptions,
    hindsightRequest?: {
      botColor: 'w' | 'b';
      botOriginalDepth: number;
      botMoveSan: string;
      botPredictedEvalFromBotPerspective: number;
      botPredictedHumanReplySan?: string;
      humanActualMoveSan: string;
      botRunnerUps: CandidateMove[];
    },
    onProgress?: (status: ThinkingStatus) => void
  ): Promise<{ searchResult: SearchResult; hindsight?: HindsightAnalysis }> {
    if (!this.worker) {
      let hindsight: HindsightAnalysis | undefined;
      if (hindsightRequest) {
        hindsight = computeHindsightAnalysis({
          fenAfterHumanReply: fen,
          ...hindsightRequest,
        });
      }
      const searchResult = searchRootPosition(fen, options, (depth, currentBestSan, nodes) => {
        onProgress?.({ isThinking: true, depth, currentBestSan, nodes });
      });
      return { searchResult, hindsight };
    }

    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      const req: WorkerRequest = {
        type: 'SEARCH_AND_HINDSIGHT',
        requestId,
        fen,
        options,
        hindsightRequest,
      };
      this.worker!.postMessage(req);
    });
  }

  public dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }
}
