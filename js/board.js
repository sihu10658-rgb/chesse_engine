import { isPiece } from "./pieces.js";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";

export function createEmptyBoard() {
  return Array(64).fill(null);
}

export function createStartPosition() {
  return parseFEN(START_FEN);
}

export function fileRankToIndex(file, rank) {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return (8 - rank) * 8 + file;
}

export function indexToFileRank(index) {
  if (index < 0 || index > 63) return null;
  return {
    file: index % 8,
    rank: 8 - Math.floor(index / 8),
  };
}

export function squareToIndex(square) {
  if (typeof square !== "string" || square.length !== 2) return null;
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return fileRankToIndex(file, rank);
}

export function indexToSquare(index) {
  const pos = indexToFileRank(index);
  if (!pos) return null;
  return FILES[pos.file] + String(pos.rank);
}

export function getPiece(state, squareOrIndex) {
  const index =
    typeof squareOrIndex === "number"
      ? squareOrIndex
      : squareToIndex(squareOrIndex);
  if (index == null) return null;
  return state.board[index];
}

export function setPiece(state, squareOrIndex, piece) {
  const index =
    typeof squareOrIndex === "number"
      ? squareOrIndex
      : squareToIndex(squareOrIndex);
  if (index == null) return state;
  const next = { ...state, board: state.board.slice() };
  next.board[index] = piece;
  return next;
}

export function parseFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  const [
    placement,
    sideToMove = "w",
    castlingToken = "-",
    enPassantToken = "-",
    halfmove = "0",
    fullmove = "1",
  ] = parts;

  const board = createEmptyBoard();
  const ranks = placement.split("/");
  if (ranks.length !== 8) {
    throw new Error("FEN placement must have 8 ranks");
  }

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let file = 0;
    for (const ch of ranks[rankIndex]) {
      if (file > 7) throw new Error("FEN rank overflows the board");
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      if (!isPiece(ch)) throw new Error(`Unknown FEN piece: ${ch}`);
      board[rankIndex * 8 + file] = ch;
      file += 1;
    }
    if (file !== 8) throw new Error("FEN rank does not fill 8 files");
  }

  return {
    board,
    sideToMove: sideToMove === "b" ? "b" : "w",
    castling: {
      K: castlingToken.includes("K"),
      Q: castlingToken.includes("Q"),
      k: castlingToken.includes("k"),
      q: castlingToken.includes("q"),
    },
    enPassant: enPassantToken === "-" ? null : enPassantToken,
    halfmoveClock: Number(halfmove) || 0,
    fullmoveNumber: Number(fullmove) || 1,
    history: [],
  };
}

export function toFEN(state) {
  const ranks = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let empty = 0;
    let row = "";
    for (let file = 0; file < 8; file += 1) {
      const piece = state.board[rankIndex * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece;
    }
    if (empty > 0) row += String(empty);
    ranks.push(row);
  }

  let castling = "";
  if (state.castling.K) castling += "K";
  if (state.castling.Q) castling += "Q";
  if (state.castling.k) castling += "k";
  if (state.castling.q) castling += "q";
  if (!castling) castling = "-";

  return [
    ranks.join("/"),
    state.sideToMove,
    castling,
    state.enPassant ?? "-",
    String(state.halfmoveClock),
    String(state.fullmoveNumber),
  ].join(" ");
}
