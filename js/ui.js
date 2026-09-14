import { pieceColor, pieceSymbol, pieceType } from "./pieces.js";
import { createStartPosition, indexToSquare, toFEN } from "./board.js";

const FILES = "abcdefgh";

function renderBoard(root, state) {
  root.replaceChildren();

  for (let index = 0; index < 64; index += 1) {
    const square = indexToSquare(index);
    const { file, rank } = {
      file: index % 8,
      rank: 8 - Math.floor(index / 8),
    };
    const isDark = (file + rank) % 2 === 1;
    const piece = state.board[index];

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `square ${isDark ? "dark" : "light"}`;
    cell.dataset.square = square;
    cell.setAttribute("aria-label", squareLabel(square, piece));

    if (file === 0) {
      const rankLabel = document.createElement("span");
      rankLabel.className = "coord coord-rank";
      rankLabel.textContent = String(rank);
      cell.append(rankLabel);
    }

    if (rank === 1) {
      const fileLabel = document.createElement("span");
      fileLabel.className = "coord coord-file";
      fileLabel.textContent = FILES[file];
      cell.append(fileLabel);
    }

    if (piece) {
      const glyph = document.createElement("span");
      glyph.className = `piece ${pieceColor(piece)}`;
      glyph.dataset.piece = piece;
      glyph.textContent = pieceSymbol(piece);
      cell.append(glyph);
    }

    root.append(cell);
  }
}

function squareLabel(square, piece) {
  if (!piece) return square;
  const color = pieceColor(piece) === "w" ? "white" : "black";
  return `${square}, ${color} ${pieceType(piece)}`;
}

function renderMeta(fenNode, turnNode, state) {
  fenNode.textContent = toFEN(state);
  turnNode.textContent = state.sideToMove === "w" ? "백" : "흑";
}

function main() {
  const boardEl = document.querySelector("#board");
  const fenEl = document.querySelector("#fen");
  const turnEl = document.querySelector("#turn");
  if (!boardEl || !fenEl || !turnEl) return;

  const state = createStartPosition();
  renderBoard(boardEl, state);
  renderMeta(fenEl, turnEl, state);
}

main();
