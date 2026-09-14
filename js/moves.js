/**
 * 기물별 의사수(pseudo-legal) 생성.
 * "의사수"는 판 위의 이동 규칙만 만족한 수다. 자기 킹이 잡히는 수도 포함된다.
 * 킹 안전 검사로 걸러내는 일은 rules.js가 한다.
 */

import { BLACK, WHITE, pieceColor, pieceType } from "./pieces.js";
import { indexToSquare, squareToIndex } from "./board.js";

export const PROMOTION_TYPES = ["q", "r", "b", "n"];

const KNIGHT_STEPS = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

const KING_STEPS = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1],
];

const ROOK_DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

/** 캐슬링할 때 룩이 지나갈 경로. [킹 시작, 룩 시작, 비어야 할 칸, 공격받으면 안 되는 칸] */
export const CASTLING_PATHS = {
  w: {
    K: { king: 60, rook: 63, kingTo: 62, rookTo: 61, empty: [61, 62], safe: [60, 61, 62] },
    Q: { king: 60, rook: 56, kingTo: 58, rookTo: 59, empty: [57, 58, 59], safe: [60, 59, 58] },
  },
  b: {
    K: { king: 4, rook: 7, kingTo: 6, rookTo: 5, empty: [5, 6], safe: [4, 5, 6] },
    Q: { king: 4, rook: 0, kingTo: 2, rookTo: 3, empty: [1, 2, 3], safe: [4, 3, 2] },
  },
};

export function fileOf(index) {
  return index % 8;
}

export function rowOf(index) {
  return Math.floor(index / 8);
}

function at(file, row) {
  if (file < 0 || file > 7 || row < 0 || row > 7) return null;
  return row * 8 + file;
}

export function opposite(color) {
  return color === WHITE ? BLACK : WHITE;
}

function createMove(from, to, piece, captured, extra) {
  return {
    from,
    to,
    piece,
    captured: captured ?? null,
    promotion: null,
    enPassant: false,
    castle: null,
    doublePawn: false,
    ...extra,
  };
}

function pushPawnMove(out, from, to, piece, captured, promotionRow) {
  if (rowOf(to) !== promotionRow) {
    out.push(createMove(from, to, piece, captured));
    return;
  }
  const white = pieceColor(piece) === WHITE;
  for (const type of PROMOTION_TYPES) {
    out.push(
      createMove(from, to, piece, captured, {
        promotion: white ? type.toUpperCase() : type,
      }),
    );
  }
}

function pawnMoves(board, from, piece, color, epIndex, out) {
  const dir = color === WHITE ? -1 : 1;
  const startRow = color === WHITE ? 6 : 1;
  const promotionRow = color === WHITE ? 0 : 7;
  const file = fileOf(from);
  const row = rowOf(from);

  const oneAhead = at(file, row + dir);
  if (oneAhead != null && !board[oneAhead]) {
    pushPawnMove(out, from, oneAhead, piece, null, promotionRow);
    if (row === startRow) {
      const twoAhead = at(file, row + dir * 2);
      if (twoAhead != null && !board[twoAhead]) {
        out.push(createMove(from, twoAhead, piece, null, { doublePawn: true }));
      }
    }
  }

  for (const side of [-1, 1]) {
    const target = at(file + side, row + dir);
    if (target == null) continue;
    const occupant = board[target];
    if (occupant) {
      if (pieceColor(occupant) !== color) {
        pushPawnMove(out, from, target, piece, occupant, promotionRow);
      }
      continue;
    }
    if (target === epIndex) {
      const capturedIndex = at(file + side, row);
      out.push(
        createMove(from, target, piece, board[capturedIndex], { enPassant: true }),
      );
    }
  }
}

function stepMoves(board, from, piece, color, steps, out) {
  for (const [df, dr] of steps) {
    const target = at(fileOf(from) + df, rowOf(from) + dr);
    if (target == null) continue;
    const occupant = board[target];
    if (occupant && pieceColor(occupant) === color) continue;
    out.push(createMove(from, target, piece, occupant));
  }
}

function slideMoves(board, from, piece, color, dirs, out) {
  for (const [df, dr] of dirs) {
    let file = fileOf(from) + df;
    let row = rowOf(from) + dr;
    for (;;) {
      const target = at(file, row);
      if (target == null) break;
      const occupant = board[target];
      if (!occupant) {
        out.push(createMove(from, target, piece, null));
      } else {
        if (pieceColor(occupant) !== color) {
          out.push(createMove(from, target, piece, occupant));
        }
        break;
      }
      file += df;
      row += dr;
    }
  }
}

function castlingMoves(state, color, out) {
  const board = state.board;
  const kingPiece = color === WHITE ? "K" : "k";
  const rookPiece = color === WHITE ? "R" : "r";
  const enemy = opposite(color);

  for (const side of ["K", "Q"]) {
    const right = color === WHITE ? side : side.toLowerCase();
    if (!state.castling[right]) continue;

    const path = CASTLING_PATHS[color][side];
    if (board[path.king] !== kingPiece) continue;
    if (board[path.rook] !== rookPiece) continue;
    if (path.empty.some((index) => board[index])) continue;
    if (path.safe.some((index) => isSquareAttacked(board, index, enemy))) continue;

    out.push(
      createMove(path.king, path.kingTo, kingPiece, null, { castle: side }),
    );
  }
}

/** 한 색의 의사수 전부. */
export function generatePseudoMoves(state, color = state.sideToMove) {
  const board = state.board;
  const epIndex = state.enPassant ? squareToIndex(state.enPassant) : null;
  const out = [];

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece || pieceColor(piece) !== color) continue;

    switch (pieceType(piece)) {
      case "pawn":
        pawnMoves(board, index, piece, color, epIndex, out);
        break;
      case "knight":
        stepMoves(board, index, piece, color, KNIGHT_STEPS, out);
        break;
      case "bishop":
        slideMoves(board, index, piece, color, BISHOP_DIRS, out);
        break;
      case "rook":
        slideMoves(board, index, piece, color, ROOK_DIRS, out);
        break;
      case "queen":
        slideMoves(board, index, piece, color, ROOK_DIRS, out);
        slideMoves(board, index, piece, color, BISHOP_DIRS, out);
        break;
      case "king":
        stepMoves(board, index, piece, color, KING_STEPS, out);
        break;
      default:
        break;
    }
  }

  castlingMoves(state, color, out);
  return out;
}

/** 해당 칸이 byColor 쪽 기물에게 공격받는가. 킹 안전 검사의 기본 도구. */
export function isSquareAttacked(board, index, byColor) {
  const file = fileOf(index);
  const row = rowOf(index);
  const white = byColor === WHITE;

  // 폰: 백 폰은 위쪽(행 감소)으로 잡으므로, 공격자는 한 행 아래에 있다.
  const pawn = white ? "P" : "p";
  const pawnRow = row + (white ? 1 : -1);
  for (const side of [-1, 1]) {
    const from = at(file + side, pawnRow);
    if (from != null && board[from] === pawn) return true;
  }

  const knight = white ? "N" : "n";
  for (const [df, dr] of KNIGHT_STEPS) {
    const from = at(file + df, row + dr);
    if (from != null && board[from] === knight) return true;
  }

  const king = white ? "K" : "k";
  for (const [df, dr] of KING_STEPS) {
    const from = at(file + df, row + dr);
    if (from != null && board[from] === king) return true;
  }

  const rook = white ? "R" : "r";
  const bishop = white ? "B" : "b";
  const queen = white ? "Q" : "q";

  for (const [dirs, straight] of [[ROOK_DIRS, rook], [BISHOP_DIRS, bishop]]) {
    for (const [df, dr] of dirs) {
      let f = file + df;
      let r = row + dr;
      for (;;) {
        const from = at(f, r);
        if (from == null) break;
        const occupant = board[from];
        if (occupant) {
          if (occupant === straight || occupant === queen) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }
  }

  return false;
}

export function findKing(board, color) {
  const king = color === WHITE ? "K" : "k";
  return board.indexOf(king);
}

/** 수를 적용한 보드만 만든다. 합법성 검사에서 쓰는 가벼운 버전. */
export function applyToBoard(board, move) {
  const next = board.slice();
  const color = pieceColor(move.piece);

  next[move.from] = null;
  if (move.enPassant) {
    next[move.to + (color === WHITE ? 8 : -8)] = null;
  }
  next[move.to] = move.promotion ?? move.piece;

  if (move.castle) {
    const path = CASTLING_PATHS[color][move.castle];
    next[path.rookTo] = next[path.rook];
    next[path.rook] = null;
  }

  return next;
}

/** 자기 킹이 잡히지 않는 수만 남긴다. */
export function generateLegalMoves(state, color = state.sideToMove) {
  const enemy = opposite(color);
  const legal = [];

  for (const move of generatePseudoMoves(state, color)) {
    const board = applyToBoard(state.board, move);
    const kingIndex = findKing(board, color);
    if (kingIndex === -1) continue;
    if (!isSquareAttacked(board, kingIndex, enemy)) legal.push(move);
  }

  return legal;
}

/** from 칸에서 갈 수 있는 합법수. UI 하이라이트용. */
export function legalMovesFrom(state, from) {
  return generateLegalMoves(state).filter((move) => move.from === from);
}

export function moveToUCI(move) {
  const promotion = move.promotion ? move.promotion.toLowerCase() : "";
  return indexToSquare(move.from) + indexToSquare(move.to) + promotion;
}
