/**
 * 수 분석기. 탐색 없이 지금 국면만 설명한다.
 * 평가 함수는 Phase 5 엔진이 그대로 쓴다. 여기서 DOM은 건드리지 않는다.
 */

import { pieceColor, pieceType } from "./pieces.js";
import { moveToUCI } from "./moves.js";
import { getGameStatus, toSAN } from "./rules.js";

/** centipawn. 킹은 탐색에서 쓰는 상한값일 뿐 재료 계산에는 넣지 않는다. */
export const PIECE_VALUES = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
};

export function valueOf(piece) {
  return PIECE_VALUES[pieceType(piece)] ?? 0;
}

/** 색별 기물 가치 합. 킹은 양쪽에 하나씩이라 빼고 센다. */
export function countMaterial(board) {
  const total = { w: 0, b: 0 };
  for (const piece of board) {
    if (!piece) continue;
    const type = pieceType(piece);
    if (type === "king") continue;
    total[pieceColor(piece)] += PIECE_VALUES[type];
  }
  return total;
}

/** 정적 평가. 백 기준 centipawn, 양수면 백이 유리하다. */
export function evaluate(state) {
  const { w, b } = countMaterial(state.board);
  return w - b;
}

/** 평가 점수를 폰 단위 문자열로. 항상 부호를 붙인다. */
export function formatScore(score) {
  const pawns = score / 100;
  if (Math.abs(pawns) < 0.005) return "0.00";
  return `${pawns > 0 ? "+" : "−"}${Math.abs(pawns).toFixed(2)}`;
}

/** 수 하나가 당장 벌어들이는 재료. 상대의 응수는 보지 않는다. */
function gainOf(move) {
  let gain = move.captured ? valueOf(move.captured) : 0;
  if (move.promotion) gain += valueOf(move.promotion) - PIECE_VALUES.pawn;
  return gain;
}

/**
 * 수 하나를 설명한다. 수를 두기 *전* 상태를 넘겨야 한다.
 * SAN이 이미 체크(+)/메이트(#)를 붙이므로 그걸 그대로 읽는다.
 */
export function describeMove(state, move, legalMoves) {
  const san = toSAN(state, move, legalMoves);
  return {
    move,
    san,
    uci: moveToUCI(move),
    piece: move.piece,
    capture: Boolean(move.captured),
    captured: move.captured,
    enPassant: move.enPassant,
    promotion: move.promotion,
    castle: move.castle,
    check: san.endsWith("+"),
    mate: san.endsWith("#"),
    gain: gainOf(move),
  };
}

/** 후보수 정렬: 메이트 → 이득 큰 순 → 체크 → 표기 순. */
function compareMoves(a, b) {
  if (a.mate !== b.mate) return a.mate ? -1 : 1;
  if (a.gain !== b.gain) return b.gain - a.gain;
  if (a.check !== b.check) return a.check ? -1 : 1;
  return a.san.localeCompare(b.san);
}

/**
 * 현재 국면 분석.
 * { sideToMove, status, check, score, material, moves, counts }
 */
export function analyze(state, status = getGameStatus(state)) {
  const moves = status.legalMoves
    .map((move) => describeMove(state, move, status.legalMoves))
    .sort(compareMoves);

  return {
    sideToMove: state.sideToMove,
    status: status.type,
    check: status.check,
    score: evaluate(state),
    material: countMaterial(state.board),
    moves,
    counts: {
      total: moves.length,
      captures: moves.filter((entry) => entry.capture).length,
      checks: moves.filter((entry) => entry.check || entry.mate).length,
      promotions: moves.filter((entry) => entry.promotion).length,
      castles: moves.filter((entry) => entry.castle).length,
      mates: moves.filter((entry) => entry.mate).length,
    },
  };
}
