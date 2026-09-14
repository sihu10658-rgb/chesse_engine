/**
 * 수를 두고 되돌리고, 국면 상태(체크/메이트/무승부)를 판정한다.
 * 이동 규칙 자체는 moves.js가 만들고, 여기서는 상태 전이와 종료 조건을 본다.
 */

import { BLACK, WHITE, pieceColor, pieceType } from "./pieces.js";
import { indexToSquare } from "./board.js";
import {
  CASTLING_PATHS,
  applyToBoard,
  fileOf,
  findKing,
  generateLegalMoves,
  isSquareAttacked,
  opposite,
  rowOf,
} from "./moves.js";

const FILES = "abcdefgh";

/** 룩이 움직이거나 잡히면 그쪽 캐슬링 권리가 사라진다. */
const ROOK_SQUARES = {
  63: "K",
  56: "Q",
  7: "k",
  0: "q",
};

export function isInCheck(state, color = state.sideToMove) {
  const kingIndex = findKing(state.board, color);
  if (kingIndex === -1) return false;
  return isSquareAttacked(state.board, kingIndex, opposite(color));
}

/** 반복수 판정에 쓰는 국면 키. 수 카운터는 제외한다. */
export function positionKey(state) {
  let castling = "";
  if (state.castling.K) castling += "K";
  if (state.castling.Q) castling += "Q";
  if (state.castling.k) castling += "k";
  if (state.castling.q) castling += "q";
  return [
    state.board.map((square) => square ?? ".").join(""),
    state.sideToMove,
    castling || "-",
    state.enPassant ?? "-",
  ].join("|");
}

function nextCastlingRights(state, move) {
  const rights = { ...state.castling };
  const color = pieceColor(move.piece);

  if (pieceType(move.piece) === "king") {
    if (color === WHITE) {
      rights.K = false;
      rights.Q = false;
    } else {
      rights.k = false;
      rights.q = false;
    }
  }

  for (const index of [move.from, move.to]) {
    const right = ROOK_SQUARES[index];
    if (right) rights[right] = false;
  }

  return rights;
}

/**
 * 수를 적용한 새 상태를 돌려준다. 원래 상태는 건드리지 않는다.
 * record가 false면 기보를 쌓지 않는다 (perft처럼 대량 탐색할 때).
 */
export function makeMove(state, move, { san = null, record = true } = {}) {
  const color = pieceColor(move.piece);
  const board = applyToBoard(state.board, move);
  const isPawn = pieceType(move.piece) === "pawn";

  const history = record
    ? [
        ...state.history,
        {
          move,
          san,
          key: positionKey(state),
          castling: state.castling,
          enPassant: state.enPassant,
          halfmoveClock: state.halfmoveClock,
          fullmoveNumber: state.fullmoveNumber,
        },
      ]
    : state.history;

  return {
    board,
    sideToMove: opposite(color),
    castling: nextCastlingRights(state, move),
    enPassant: move.doublePawn
      ? indexToSquare((move.from + move.to) / 2)
      : null,
    halfmoveClock: isPawn || move.captured ? 0 : state.halfmoveClock + 1,
    fullmoveNumber: color === BLACK ? state.fullmoveNumber + 1 : state.fullmoveNumber,
    history,
  };
}

/** 마지막 수를 되돌린다. 되돌릴 수가 없으면 null. */
export function undoMove(state) {
  if (state.history.length === 0) return null;

  const entry = state.history[state.history.length - 1];
  const move = entry.move;
  const color = pieceColor(move.piece);
  const board = state.board.slice();

  board[move.from] = move.piece;
  board[move.to] = null;

  if (move.enPassant) {
    board[move.to + (color === WHITE ? 8 : -8)] = move.captured;
  } else if (move.captured) {
    board[move.to] = move.captured;
  }

  if (move.castle) {
    const path = CASTLING_PATHS[color][move.castle];
    board[path.rook] = board[path.rookTo];
    board[path.rookTo] = null;
  }

  return {
    board,
    sideToMove: color,
    castling: entry.castling,
    enPassant: entry.enPassant,
    halfmoveClock: entry.halfmoveClock,
    fullmoveNumber: entry.fullmoveNumber,
    history: state.history.slice(0, -1),
  };
}

function countRepetitions(state) {
  const key = positionKey(state);
  let count = 1;
  for (const entry of state.history) {
    if (entry.key === key) count += 1;
  }
  return count;
}

/** 킹 + 마이너 피스만 남아 메이트가 불가능한가. */
export function hasInsufficientMaterial(board) {
  const bishops = [];
  let knights = 0;

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const type = pieceType(piece);
    if (type === "king") continue;
    if (type === "bishop") {
      bishops.push((fileOf(index) + rowOf(index)) % 2);
      continue;
    }
    if (type === "knight") {
      knights += 1;
      continue;
    }
    return false; // 폰 / 룩 / 퀸이 남아 있으면 메이트 가능
  }

  if (bishops.length === 0 && knights === 0) return true; // K vs K
  if (bishops.length === 0 && knights === 1) return true; // K+N vs K
  if (knights === 0 && bishops.length === 1) return true; // K+B vs K
  if (knights === 0 && bishops.length === 2 && bishops[0] === bishops[1]) {
    return true; // 같은 색 칸 비숍끼리
  }
  return false;
}

/**
 * 현재 국면의 상태.
 * { type, check, legalMoves, winner?, reason? }
 */
export function getGameStatus(state) {
  const legalMoves = generateLegalMoves(state);
  const check = isInCheck(state);

  if (legalMoves.length === 0) {
    if (check) {
      return {
        type: "checkmate",
        check: true,
        legalMoves,
        winner: opposite(state.sideToMove),
      };
    }
    return { type: "stalemate", check: false, legalMoves };
  }

  if (hasInsufficientMaterial(state.board)) {
    return { type: "draw", check, legalMoves, reason: "insufficient-material" };
  }
  if (state.halfmoveClock >= 100) {
    return { type: "draw", check, legalMoves, reason: "fifty-move" };
  }
  if (countRepetitions(state) >= 3) {
    return { type: "draw", check, legalMoves, reason: "threefold" };
  }

  return { type: "playing", check, legalMoves };
}

export function isGameOver(status) {
  return status.type !== "playing";
}

/**
 * 대수 표기(SAN). 수를 두기 *전* 상태를 넘겨야 한다.
 * legalMoves를 함께 주면 중복 계산을 피한다.
 */
export function toSAN(state, move, legalMoves = generateLegalMoves(state)) {
  let san;

  if (move.castle) {
    san = move.castle === "K" ? "O-O" : "O-O-O";
  } else if (pieceType(move.piece) === "pawn") {
    const captures = move.captured || move.enPassant;
    san = captures
      ? `${FILES[fileOf(move.from)]}x${indexToSquare(move.to)}`
      : indexToSquare(move.to);
    if (move.promotion) san += `=${move.promotion.toUpperCase()}`;
  } else {
    const rivals = legalMoves.filter(
      (other) =>
        other.piece === move.piece &&
        other.to === move.to &&
        other.from !== move.from,
    );

    let disambiguation = "";
    if (rivals.length > 0) {
      const sameFile = rivals.some((other) => fileOf(other.from) === fileOf(move.from));
      const sameRow = rivals.some((other) => rowOf(other.from) === rowOf(move.from));
      if (!sameFile) {
        disambiguation = FILES[fileOf(move.from)];
      } else if (!sameRow) {
        disambiguation = String(8 - rowOf(move.from));
      } else {
        disambiguation = indexToSquare(move.from);
      }
    }

    san =
      move.piece.toUpperCase() +
      disambiguation +
      (move.captured ? "x" : "") +
      indexToSquare(move.to);
  }

  const next = makeMove(state, move, { record: false });
  if (isInCheck(next)) {
    san += generateLegalMoves(next).length === 0 ? "#" : "+";
  }
  return san;
}

/** 수를 두고, 기보에 SAN까지 남긴 새 상태를 돌려준다. */
export function playMove(state, move, legalMoves) {
  const san = toSAN(state, move, legalMoves);
  return makeMove(state, move, { san });
}
