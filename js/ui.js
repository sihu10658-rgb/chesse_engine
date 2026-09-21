/**
 * 클릭으로 두는 보드 UI.
 * 규칙 계산은 전부 moves.js / rules.js가 한다. 여기서는 그리기와 입력만 맡는다.
 */

import { pieceColor, pieceSymbol, pieceType } from "./pieces.js";
import { createStartPosition, indexToSquare, toFEN } from "./board.js";
import { findKing } from "./moves.js";
import { getGameStatus, isGameOver, playMove, undoMove } from "./rules.js";
import { analyze, formatScore } from "./analyzer.js";

const FILES = "abcdefgh";

const dom = {
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  turn: document.querySelector("#turn"),
  legalCount: document.querySelector("#legal-count"),
  fen: document.querySelector("#fen"),
  moves: document.querySelector("#moves"),
  newGame: document.querySelector("#new-game"),
  undo: document.querySelector("#undo"),
  flip: document.querySelector("#flip"),
  evalScore: document.querySelector("#eval-score"),
  evalFill: document.querySelector("#eval-fill"),
  moveCounts: document.querySelector("#move-counts"),
  candidates: document.querySelector("#candidates"),
  promotion: document.querySelector("#promotion"),
  promotionChoices: document.querySelector("#promotion-choices"),
  promotionCancel: document.querySelector("#promotion-cancel"),
};

let state = createStartPosition();
let status = getGameStatus(state);
let report = analyze(state, status);
let selected = null;
let flipped = false;
let pendingPromotion = null;

function movesFrom(index) {
  return status.legalMoves.filter((move) => move.from === index);
}

function lastMove() {
  const entry = state.history[state.history.length - 1];
  return entry ? entry.move : null;
}

function checkedKingIndex() {
  if (!status.check) return -1;
  return findKing(state.board, state.sideToMove);
}

function colorName(color) {
  return color === "w" ? "백" : "흑";
}

function statusText() {
  switch (status.type) {
    case "checkmate":
      return `체크메이트 — ${colorName(status.winner)} 승`;
    case "stalemate":
      return "스테일메이트 — 무승부";
    case "draw":
      return `무승부 — ${drawReasonText(status.reason)}`;
    default:
      return status.check
        ? `${colorName(state.sideToMove)} 차례 — 체크!`
        : `${colorName(state.sideToMove)} 차례`;
  }
}

function drawReasonText(reason) {
  if (reason === "insufficient-material") return "기물 부족";
  if (reason === "fifty-move") return "50수 규칙";
  if (reason === "threefold") return "3회 동형";
  return "무승부";
}

function squareLabel(square, piece) {
  if (!piece) return square;
  return `${square}, ${colorName(pieceColor(piece))} ${pieceType(piece)}`;
}

function renderBoard() {
  const targets = selected == null ? [] : movesFrom(selected);
  const targetByIndex = new Map(targets.map((move) => [move.to, move]));
  const last = lastMove();
  const checkedKing = checkedKingIndex();
  const over = isGameOver(status);

  const fragment = document.createDocumentFragment();

  for (let order = 0; order < 64; order += 1) {
    const index = flipped ? 63 - order : order;
    const file = index % 8;
    const rank = 8 - Math.floor(index / 8);
    const square = indexToSquare(index);
    const piece = state.board[index];

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `square ${(file + rank) % 2 === 1 ? "dark" : "light"}`;
    cell.dataset.index = String(index);
    cell.setAttribute("aria-label", squareLabel(square, piece));

    if (index === selected) cell.classList.add("selected");
    if (last && (index === last.from || index === last.to)) {
      cell.classList.add("last-move");
    }
    if (index === checkedKing) cell.classList.add("in-check");

    const target = targetByIndex.get(index);
    if (target) {
      cell.classList.add(target.captured ? "capture-target" : "move-target");
    }

    const canPick =
      !over && piece && pieceColor(piece) === state.sideToMove && movesFrom(index).length > 0;
    if (canPick || target) cell.classList.add("actionable");

    // 좌표는 가장자리 칸에만. 보드를 뒤집으면 표시 위치도 따라간다.
    const edgeFile = flipped ? 7 : 0;
    const edgeRank = flipped ? 8 : 1;
    if (file === edgeFile) {
      cell.append(coordLabel("coord-rank", String(rank)));
    }
    if (rank === edgeRank) {
      cell.append(coordLabel("coord-file", FILES[file]));
    }

    if (piece) {
      const glyph = document.createElement("span");
      glyph.className = `piece ${pieceColor(piece)}`;
      glyph.dataset.piece = piece;
      glyph.textContent = pieceSymbol(piece);
      cell.append(glyph);
    }

    fragment.append(cell);
  }

  dom.board.replaceChildren(fragment);
}

function coordLabel(className, text) {
  const span = document.createElement("span");
  span.className = `coord ${className}`;
  span.textContent = text;
  return span;
}

function renderPanel() {
  dom.status.textContent = statusText();
  dom.status.classList.toggle("over", isGameOver(status));
  dom.turn.textContent = colorName(state.sideToMove);
  dom.legalCount.textContent = String(status.legalMoves.length);
  dom.fen.textContent = toFEN(state);
  dom.undo.disabled = state.history.length === 0;

  renderMoveList();
  renderAnalysis();
}

/** 평가 막대는 ±10폰을 양 끝으로 본다. 그 밖은 끝에 붙인다. */
function evalPercent(score) {
  const clamped = Math.max(-1000, Math.min(1000, score));
  return 50 + clamped / 20;
}

function renderAnalysis() {
  dom.evalScore.textContent = formatScore(report.score);
  dom.evalScore.classList.toggle("ahead-white", report.score > 0);
  dom.evalScore.classList.toggle("ahead-black", report.score < 0);
  dom.evalFill.style.width = `${evalPercent(report.score)}%`;

  const { captures, checks, promotions } = report.counts;
  dom.moveCounts.textContent = `캡처 ${captures} · 체크 ${checks} · 승격 ${promotions}`;

  renderCandidates();
}

function renderCandidates() {
  if (report.moves.length === 0) {
    const empty = document.createElement("li");
    empty.className = "moves-empty";
    empty.textContent = "둘 수 있는 수가 없습니다.";
    dom.candidates.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of report.moves) {
    const item = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate";
    if (entry.move.from === selected) button.classList.add("from-selected");
    button.addEventListener("click", () => playCandidate(entry));

    const san = document.createElement("span");
    san.className = "candidate-san";
    san.textContent = entry.san;
    button.append(san);

    const tag = candidateTag(entry);
    if (tag) {
      const label = document.createElement("span");
      label.className = `candidate-tag ${tag.className}`;
      label.textContent = tag.text;
      button.append(label);
    }

    item.append(button);
    fragment.append(item);
  }

  dom.candidates.replaceChildren(fragment);
  dom.candidates.scrollTop = 0;
}

function candidateTag(entry) {
  if (entry.mate) return { text: "메이트", className: "mate" };
  if (entry.promotion) return { text: `+${entry.gain / 100}`, className: "gain" };
  if (entry.capture) return { text: `+${entry.gain / 100}`, className: "gain" };
  if (entry.check) return { text: "체크", className: "check" };
  if (entry.castle) return { text: "캐슬링", className: "quiet" };
  return null;
}

function playCandidate(entry) {
  if (pendingPromotion || isGameOver(status)) return;
  applyMove(entry.move);
}

function renderMoveList() {
  if (state.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "moves-empty";
    empty.textContent = "아직 둔 수가 없습니다.";
    dom.moves.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < state.history.length; i += 2) {
    const item = document.createElement("li");
    item.className = "move-pair";

    const white = document.createElement("span");
    white.textContent = state.history[i].san ?? "";
    item.append(white);

    const black = document.createElement("span");
    black.textContent = state.history[i + 1]?.san ?? "";
    item.append(black);

    if (i + 1 >= state.history.length - 1) item.classList.add("latest");
    fragment.append(item);
  }

  dom.moves.replaceChildren(fragment);
  dom.moves.scrollTop = dom.moves.scrollHeight;
}

function render() {
  renderBoard();
  renderPanel();
}

function refresh() {
  status = getGameStatus(state);
  report = analyze(state, status);
  render();
}

function applyMove(move) {
  state = playMove(state, move, status.legalMoves);
  selected = null;
  refresh();
}

function handleSquareClick(index) {
  if (pendingPromotion) return;

  if (selected != null) {
    const candidates = movesFrom(selected).filter((move) => move.to === index);
    if (candidates.length === 1) {
      applyMove(candidates[0]);
      return;
    }
    if (candidates.length > 1) {
      openPromotion(candidates);
      return;
    }
  }

  const piece = state.board[index];
  if (isGameOver(status) || !piece || pieceColor(piece) !== state.sideToMove) {
    selected = null;
  } else {
    selected = selected === index ? null : index;
  }
  render();
}

function openPromotion(candidates) {
  pendingPromotion = candidates;

  const fragment = document.createDocumentFragment();
  for (const move of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `promotion-choice piece ${pieceColor(move.promotion)}`;
    button.textContent = pieceSymbol(move.promotion);
    button.setAttribute("aria-label", pieceType(move.promotion));
    button.addEventListener("click", () => {
      closePromotion();
      applyMove(move);
    });
    fragment.append(button);
  }

  dom.promotionChoices.replaceChildren(fragment);
  dom.promotion.hidden = false;
  dom.promotionChoices.querySelector("button")?.focus();
}

function closePromotion() {
  pendingPromotion = null;
  dom.promotion.hidden = true;
  dom.promotionChoices.replaceChildren();
}

dom.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".square");
  if (!cell) return;
  handleSquareClick(Number(cell.dataset.index));
});

dom.newGame.addEventListener("click", () => {
  closePromotion();
  state = createStartPosition();
  selected = null;
  refresh();
});

dom.undo.addEventListener("click", () => {
  closePromotion();
  const previous = undoMove(state);
  if (!previous) return;
  state = previous;
  selected = null;
  refresh();
});

dom.flip.addEventListener("click", () => {
  flipped = !flipped;
  render();
});

dom.promotionCancel.addEventListener("click", closePromotion);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (pendingPromotion) {
    closePromotion();
    return;
  }
  if (selected != null) {
    selected = null;
    render();
  }
});

refresh();
