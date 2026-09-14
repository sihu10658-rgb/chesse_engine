/** FEN 한 글자 기물 표기. 빈 칸은 null. */

export const WHITE = "w";
export const BLACK = "b";

export const PIECE_TYPES = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

const SYMBOLS = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export function isPiece(value) {
  return typeof value === "string" && value in SYMBOLS;
}

export function pieceColor(piece) {
  if (!isPiece(piece)) return null;
  return piece === piece.toUpperCase() ? WHITE : BLACK;
}

export function pieceType(piece) {
  if (!isPiece(piece)) return null;
  return PIECE_TYPES[piece.toLowerCase()];
}

export function pieceSymbol(piece) {
  return SYMBOLS[piece] ?? "";
}

export function isWhitePiece(piece) {
  return pieceColor(piece) === WHITE;
}

export function isBlackPiece(piece) {
  return pieceColor(piece) === BLACK;
}
