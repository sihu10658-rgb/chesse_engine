/**
 * 대국 시나리오 테스트.
 * UI가 타는 경로(합법수 고르기 → playMove → getGameStatus)를 그대로 돌린다.
 *
 *   node tests/game.js
 */

import { createStartPosition, parseFEN, squareToIndex, toFEN } from "../js/board.js";
import { getGameStatus, playMove, undoMove } from "../js/rules.js";

let failures = 0;

function check(label, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "  ok" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

/** UI 클릭과 같은 방식: from/to(+승격 기물)로 합법수를 찾아 둔다. */
function play(state, from, to, promotion = null) {
  const status = getGameStatus(state);
  const move = status.legalMoves.find(
    (candidate) =>
      candidate.from === squareToIndex(from) &&
      candidate.to === squareToIndex(to) &&
      (promotion
        ? candidate.promotion?.toLowerCase() === promotion
        : !candidate.promotion),
  );
  if (!move) throw new Error(`불법수: ${from}${to}${promotion ?? ""}`);
  return playMove(state, move, status.legalMoves);
}

function sanOf(state) {
  return state.history[state.history.length - 1].san;
}

console.log("대국 시나리오");

console.log("\n[게임 종료 판정]");
let state = createStartPosition();
for (const [from, to] of [
  ["e2", "e4"], ["e7", "e5"],
  ["f1", "c4"], ["b8", "c6"],
  ["d1", "h5"], ["g8", "f6"],
  ["h5", "f7"],
]) {
  state = play(state, from, to);
}
let status = getGameStatus(state);
check("학자 메이트 → 백 승", status.type === "checkmate" && status.winner === "w");
check(
  "기보 SAN",
  state.history.map((entry) => entry.san).join(" ") ===
    "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#",
  state.history.map((entry) => entry.san).join(" "),
);
check(
  "바보 메이트",
  getGameStatus(
    parseFEN("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"),
  ).type === "checkmate",
);
check(
  "스테일메이트",
  getGameStatus(parseFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).type === "stalemate",
);
check(
  "K vs K → 기물 부족 무승부",
  getGameStatus(parseFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1")).reason ===
    "insufficient-material",
);

state = createStartPosition();
for (const [from, to] of [
  ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
  ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
]) {
  state = play(state, from, to);
}
check("3회 동형 무승부", getGameStatus(state).reason === "threefold");

console.log("\n[특수 규칙]");
state = parseFEN("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1");
state = play(state, "e1", "g1");
check(
  "백 킹사이드 캐슬링",
  state.board[squareToIndex("g1")] === "K" && state.board[squareToIndex("f1")] === "R",
);
check("캐슬링 SAN", sanOf(state) === "O-O", sanOf(state));
state = play(state, "e8", "c8");
check(
  "흑 퀸사이드 캐슬링",
  state.board[squareToIndex("c8")] === "k" && state.board[squareToIndex("d8")] === "r",
);
check("캐슬링 권리 소멸", toFEN(state).split(" ")[2] === "-", toFEN(state).split(" ")[2]);

state = parseFEN("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
state = play(state, "e5", "f6");
check(
  "앙파상으로 폰이 사라짐",
  state.board[squareToIndex("f6")] === "P" && state.board[squareToIndex("f5")] === null,
);
check("앙파상 SAN", sanOf(state) === "exf6", sanOf(state));

state = parseFEN("8/P6k/8/8/8/8/6K1/8 w - - 0 1");
const promotions = getGameStatus(state).legalMoves.filter(
  (move) => move.from === squareToIndex("a7") && move.to === squareToIndex("a8"),
);
check("프로모션 후보 4개 (UI 선택지)", promotions.length === 4, String(promotions.length));
state = play(state, "a7", "a8", "n");
check("나이트 승격", state.board[squareToIndex("a8")] === "N");
check("프로모션 SAN", sanOf(state) === "a8=N", sanOf(state));

console.log("\n[킹 안전]");
state = parseFEN("4r3/8/8/8/8/8/4N3/4K3 w - - 0 1");
check(
  "핀된 나이트는 못 움직임",
  getGameStatus(state).legalMoves.every((move) => move.piece !== "N"),
);
check(
  "체크 상태 인식",
  getGameStatus(parseFEN("4k3/8/8/8/8/8/8/4K2R b K - 0 1")).check === false,
);
check(
  "체크 중에는 체크 해소 수만",
  getGameStatus(parseFEN("4k2R/8/8/8/8/8/8/4K3 b - - 0 1")).legalMoves.every(
    (move) => move.piece === "k",
  ),
);

console.log("\n[기보 표기]");
state = parseFEN("8/8/8/3k4/8/8/R6R/4K3 w - - 0 1");
status = getGameStatus(state);
const rookMove = status.legalMoves.find(
  (move) => move.piece === "R" && move.to === squareToIndex("d2"),
);
const rookSAN = playMove(state, rookMove, status.legalMoves).history.at(-1).san;
check("같은 칸으로 갈 수 있는 룩 구분", /^R[ah]d2\+?$/.test(rookSAN), rookSAN);

console.log("\n[무르기]");
state = createStartPosition();
const startFEN = toFEN(state);
state = play(state, "e2", "e4");
state = play(state, "e7", "e5");
state = undoMove(state);
state = undoMove(state);
check("2수 무르면 시작 국면", toFEN(state) === startFEN && state.history.length === 0);
check("시작 국면에서는 무를 수 없음", undoMove(state) === null);

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
