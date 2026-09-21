/**
 * 탐색 엔진. 네가맥스 + 알파베타, 반복 심화, 정지 탐색(캡처만).
 * 평가는 analyzer.js의 기물 가치에 위치 점수(piece-square table)를 더해 쓴다.
 * DOM은 모른다. UI가 findBestMove를 부르고 결과를 그리면 된다.
 */

import { pieceColor, pieceType } from "./pieces.js";
import { findKing, generateLegalMoves, opposite } from "./moves.js";
import { hasInsufficientMaterial, isInCheck, makeMove } from "./rules.js";
import { PIECE_VALUES, evaluate, valueOf } from "./analyzer.js";

/** 메이트 점수. 재료 점수가 절대 닿을 수 없는 크기로 둔다. */
export const MATE_SCORE = 100000;

/** 정지 탐색이 끝없이 깊어지지 않게 막는 한계. */
const MAX_QUIESCENCE_PLY = 6;

/**
 * 위치 점수표. 전부 백 기준이고, 첫 줄이 8랭크다 (보드 인덱스 0 = a8).
 * 흑은 랭크를 뒤집어(index ^ 56) 같은 표를 읽는다.
 */
const PST = {
  pawn: [
      0,   0,   0,   0,   0,   0,   0,   0,
     50,  50,  50,  50,  50,  50,  50,  50,
     10,  10,  20,  30,  30,  20,  10,  10,
      5,   5,  10,  25,  25,  10,   5,   5,
      0,   0,   0,  20,  20,   0,   0,   0,
      5,  -5, -10,   0,   0, -10,  -5,   5,
      5,  10,  10, -20, -20,  10,  10,   5,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  knight: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  bishop: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  rook: [
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0,
  ],
  queen: [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20,
  ],
  king: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20,
  ],
  kingEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10,   0,   0, -10, -20, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -30,   0,   0,   0,   0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

function mirror(index) {
  return index ^ 56; // 랭크만 뒤집는다
}

/** 퀸이 다 빠졌거나 남은 재료가 적으면 엔드게임으로 본다 (킹 표를 바꾼다). */
export function isEndgame(board) {
  let heavy = 0;
  for (const piece of board) {
    if (!piece) continue;
    const type = pieceType(piece);
    if (type === "king" || type === "pawn") continue;
    heavy += PIECE_VALUES[type];
  }
  return heavy <= 2 * PIECE_VALUES.rook + PIECE_VALUES.bishop;
}

/** 위치 점수 합. 백 기준 centipawn. */
export function positionScore(board) {
  const endgame = isEndgame(board);
  let score = 0;

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const type = pieceType(piece);
    const table = type === "king" && endgame ? PST.kingEnd : PST[type];
    const white = pieceColor(piece) === "w";
    const value = table[white ? index : mirror(index)];
    score += white ? value : -value;
  }

  return score;
}

/** 칸이 판 가운데서 얼마나 떨어져 있나. 중앙 4칸이 0, 구석이 6. */
function centerDistance(index) {
  const file = index % 8;
  const row = index >> 3;
  return Math.max(3 - file, file - 4, 0) + Math.max(3 - row, row - 4, 0);
}

function kingDistance(a, b) {
  return Math.abs((a % 8) - (b % 8)) + Math.abs((a >> 3) - (b >> 3));
}

/**
 * 재료가 크게 앞선 엔드게임에서 진 쪽 킹을 구석으로 몰고 내 킹을 붙인다.
 * 이게 없으면 K+Q vs K에서 퀸만 빙빙 돌다 50수 규칙에 걸린다.
 */
function mopUpScore(board, material) {
  if (Math.abs(material) < PIECE_VALUES.rook) return 0;

  const winner = material > 0 ? "w" : "b";
  const strong = findKing(board, winner);
  const weak = findKing(board, opposite(winner));
  if (strong === -1 || weak === -1) return 0;

  const score = centerDistance(weak) * 10 + (14 - kingDistance(strong, weak)) * 4;
  return material > 0 ? score : -score;
}

/** 탐색이 쓰는 평가. 백 기준 centipawn. */
export function evaluatePosition(state) {
  const material = evaluate(state);
  const score = material + positionScore(state.board);
  return isEndgame(state.board) ? score + mopUpScore(state.board, material) : score;
}

/** 네가맥스는 둘 차례 쪽 기준으로 점수를 본다. */
function sideScore(state) {
  const score = evaluatePosition(state);
  return state.sideToMove === "w" ? score : -score;
}

/** 캡처 우선 정렬(MVV-LVA). 가지치기 효율이 여기서 갈린다. */
function orderingScore(move) {
  let score = 0;
  if (move.captured) score += 10 * valueOf(move.captured) - valueOf(move.piece);
  if (move.promotion) score += valueOf(move.promotion);
  if (move.castle) score += 30;
  return score;
}

function ordered(moves) {
  return moves
    .map((move) => ({ move, score: orderingScore(move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function play(state, move) {
  return makeMove(state, move, { record: false });
}

/** 탐색 한 번에서 공유하는 상태. 전역으로 두지 않고 매번 새로 만든다. */
function createContext(deadline, useQuiescence) {
  return { nodes: 0, deadline, aborted: false, quiescence: useQuiescence };
}

function outOfTime(ctx) {
  if (ctx.aborted) return true;
  if (ctx.deadline && (ctx.nodes & 1023) === 0 && Date.now() >= ctx.deadline) {
    ctx.aborted = true;
  }
  return ctx.aborted;
}

/**
 * 정지 탐색. 캡처가 이어지는 동안만 더 본다.
 * 이게 없으면 깊이 끝에서 "방금 잡았다"는 국면을 좋게 보고 기물을 그냥 준다.
 */
function quiescence(state, alpha, beta, ply, ctx) {
  ctx.nodes += 1;
  if (outOfTime(ctx)) return alpha;

  const check = isInCheck(state);

  // 체크 중에는 가만히 있을 수 없다. 모든 수를 본다.
  if (!check) {
    const standPat = sideScore(state);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (ply >= MAX_QUIESCENCE_PLY) return alpha;
  }

  // 체크가 계속 이어지면 정지 탐색이 끝나지 않는다. 두 배 깊이에서 끊는다.
  if (check && ply >= MAX_QUIESCENCE_PLY * 2) return sideScore(state);

  const legal = generateLegalMoves(state);
  if (legal.length === 0) return check ? -(MATE_SCORE - ply) : 0;

  const moves = ordered(
    check ? legal : legal.filter((move) => move.captured || move.promotion),
  );

  for (const move of moves) {
    const score = -quiescence(play(state, move), -beta, -alpha, ply + 1, ctx);
    if (outOfTime(ctx)) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function negamax(state, depth, alpha, beta, ply, ctx) {
  ctx.nodes += 1;
  if (outOfTime(ctx)) return alpha;

  const legal = generateLegalMoves(state);
  if (legal.length === 0) {
    // 메이트는 빨리 끝낼수록 좋게 본다. ply를 빼서 가까운 메이트를 고른다.
    return isInCheck(state) ? -(MATE_SCORE - ply) : 0;
  }
  if (ply > 0 && (state.halfmoveClock >= 100 || hasInsufficientMaterial(state.board))) {
    return 0;
  }
  if (depth === 0) {
    return ctx.quiescence ? quiescence(state, alpha, beta, ply, ctx) : sideScore(state);
  }

  let best = -Infinity;
  for (const move of ordered(legal)) {
    const score = -negamax(play(state, move), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (outOfTime(ctx)) return best === -Infinity ? alpha : best;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // 베타 컷오프
  }

  return best;
}

/** 루트. 최선수와 점수를 함께 돌려준다. */
function searchRoot(state, depth, ctx) {
  const legal = generateLegalMoves(state);
  if (legal.length === 0) return null;

  let bestMove = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const move of ordered(legal)) {
    const score = -negamax(play(state, move), depth - 1, -Infinity, -alpha, 1, ctx);
    if (outOfTime(ctx)) break;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      if (score > alpha) alpha = score;
    }
  }

  return bestMove ? { move: bestMove, score: bestScore } : null;
}

/**
 * 반복 심화로 최선수를 찾는다.
 * 시간이 모자라면 마지막으로 끝낸 깊이의 결과를 쓴다 (도중에 끊긴 깊이는 버린다).
 * timeMs가 0이면 시간 제한 없이 깊이까지 다 본다.
 * quiescence를 끄면 순수 알파베타가 된다 (테스트에서 전폭 탐색과 값을 맞춰볼 때 쓴다).
 *
 * { move, score, depth, nodes, elapsed, mateIn }
 */
export function findBestMove(
  state,
  { depth = 3, timeMs = 1000, quiescence: useQuiescence = true } = {},
) {
  const started = Date.now();
  const ctx = createContext(timeMs > 0 ? started + timeMs : 0, useQuiescence);

  let result = null;
  for (let current = 1; current <= depth; current += 1) {
    const attempt = searchRoot(state, current, ctx);
    if (ctx.aborted) break;
    if (!attempt) break;
    result = { ...attempt, depth: current };
    if (Math.abs(attempt.score) >= MATE_SCORE - 100) break; // 메이트를 찾으면 더 볼 것 없다
  }

  if (!result) return null;
  return {
    ...result,
    nodes: ctx.nodes,
    elapsed: Date.now() - started,
    mateIn: mateDistance(result.score),
  };
}

/** 메이트 점수를 "몇 수 뒤"로 바꾼다. 메이트가 아니면 null. */
export function mateDistance(score) {
  const distance = MATE_SCORE - Math.abs(score);
  if (distance > 100) return null;
  const moves = Math.ceil(distance / 2);
  return score > 0 ? moves : -moves;
}
