/**
 * 엔진 테스트. 탐색이 규칙을 지키고, 뻔한 수를 놓치지 않는지 본다.
 *
 *   node tests/engine.js
 */

import { createStartPosition, parseFEN, START_FEN } from "../js/board.js";
import { generateLegalMoves } from "../js/moves.js";
import { getGameStatus, isInCheck, makeMove, toSAN } from "../js/rules.js";
import {
  MATE_SCORE,
  evaluatePosition,
  findBestMove,
  isEndgame,
  mateDistance,
  positionScore,
} from "../js/engine.js";

let failures = 0;

function check(label, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "  ok" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

/** 엔진이 고른 수를 SAN으로. */
function bestSAN(fen, options = { depth: 3, timeMs: 0 }) {
  const state = parseFEN(fen);
  const result = findBestMove(state, options);
  return result ? toSAN(state, result.move) : null;
}

/** 가지치기 없는 전폭 네가맥스. 알파베타가 같은 값을 내는지 대조하는 용도. */
function fullWidth(state, depth) {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) {
    return isInCheck(state) ? -MATE_SCORE : 0;
  }
  if (depth === 0) {
    const score = evaluatePosition(state);
    return state.sideToMove === "w" ? score : -score;
  }

  let best = -Infinity;
  for (const move of moves) {
    const score = -fullWidth(makeMove(state, move, { record: false }), depth - 1);
    if (score > best) best = score;
  }
  return best;
}

console.log("엔진");

console.log("\n[평가]");
const start = createStartPosition();
check("시작 위치 위치 점수 0 (대칭)", positionScore(start.board) === 0, String(positionScore(start.board)));
check("시작 위치 평가 0", evaluatePosition(start) === 0, String(evaluatePosition(start)));
check("시작 위치는 엔드게임이 아님", isEndgame(start.board) === false);
check("K+Q vs K는 엔드게임", isEndgame(parseFEN("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1").board));
check(
  "중앙 폰이 시작 칸 폰보다 낫다",
  evaluatePosition(parseFEN("4k3/8/8/8/3P4/8/8/4K3 w - - 0 1")) >
    evaluatePosition(parseFEN("4k3/8/8/8/8/8/3P4/4K3 w - - 0 1")),
);
check("메이트 거리 환산", mateDistance(MATE_SCORE - 1) === 1 && mateDistance(0) === null);
check("당하는 메이트는 음수", mateDistance(-(MATE_SCORE - 3)) === -2, String(mateDistance(-(MATE_SCORE - 3))));

console.log("\n[알파베타 정확성]");
for (const [name, fen, depth] of [
  ["시작 위치 깊이 3", START_FEN, 3],
  ["오프닝 깊이 3", "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1", 3],
  ["엔드게임 깊이 4", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4],
]) {
  const state = parseFEN(fen);
  // 정지 탐색을 끄면 전폭 탐색과 같은 나무를 본다. 값이 같아야 가지치기가 옳다.
  const pruned = findBestMove(state, { depth, timeMs: 0, quiescence: false });
  const plain = fullWidth(state, depth);
  check(`${name} — 가지치기해도 같은 점수`, pruned.score === plain, `${pruned.score} vs ${plain}`);
}

console.log("\n[전술]");
check("1수 메이트 (백)", bestSAN("6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1") === "Ra8#");
check(
  "1수 메이트 (흑)",
  bestSAN("r3k2r/8/8/8/8/8/5PPP/6K1 b kq - 0 1") === "Ra1#",
  String(bestSAN("r3k2r/8/8/8/8/8/5PPP/6K1 b kq - 0 1")),
);
check(
  "백랭크 메이트를 2수 앞에서 본다",
  findBestMove(parseFEN("6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1"), { depth: 3, timeMs: 0 })
    .mateIn === 1,
);
check("공짜 퀸을 잡는다", bestSAN("rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1") === "exd5");
check(
  "공짜 폰을 잡는다",
  bestSAN("4k3/8/8/3p4/8/3Q4/8/4K3 w - - 0 1") === "Qxd5",
  String(bestSAN("4k3/8/8/3p4/8/3Q4/8/4K3 w - - 0 1")),
);
check(
  "지켜진 폰은 퀸으로 잡지 않는다 (정지 탐색)",
  bestSAN("4k3/8/2p5/3p4/8/3Q4/8/4K3 w - - 0 1") !== "Qxd5+",
  String(bestSAN("4k3/8/2p5/3p4/8/3Q4/8/4K3 w - - 0 1")),
);
// e2 퀸이 d3 폰에게 잡히게 생겼다. d3은 c4 폰이 지키므로 Qxd3은 퀸을 버리는 수다.
const hanging = "4k3/8/8/8/2p5/3p4/4Q3/4K3 w - - 0 1";
check("잡히게 생긴 퀸을 살린다", bestSAN(hanging) !== "Qxd3", String(bestSAN(hanging)));
check(
  "퀸을 지키면 평가도 앞선다",
  findBestMove(parseFEN(hanging), { depth: 3, timeMs: 0 }).score > 500,
  String(findBestMove(parseFEN(hanging), { depth: 3, timeMs: 0 }).score),
);

console.log("\n[탐색 제어]");
const startResult = findBestMove(createStartPosition(), { depth: 3, timeMs: 0 });
check("합법수를 고른다", generateLegalMoves(createStartPosition()).some(
  (move) => move.from === startResult.move.from && move.to === startResult.move.to,
));
check("깊이 3까지 본다", startResult.depth === 3, String(startResult.depth));
check("노드 수를 보고한다", startResult.nodes > 0, String(startResult.nodes));

const limited = findBestMove(createStartPosition(), { depth: 20, timeMs: 150 });
check("시간 제한을 지킨다", limited.elapsed < 1500, `${limited.elapsed}ms`);
check("제한 안에서 끝낸 깊이만 쓴다", limited.depth < 20 && limited.move != null, String(limited.depth));

check(
  "체크메이트 국면에서는 둘 수가 없다",
  findBestMove(parseFEN("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")) === null,
);

console.log("\n[K+Q vs K 외통]");
let mateState = parseFEN("7k/8/8/8/8/8/5Q2/6K1 w - - 0 1");
let mated = false;
for (let ply = 0; ply < 60; ply += 1) {
  const status = getGameStatus(mateState);
  if (status.type === "checkmate") { mated = true; break; }
  if (status.legalMoves.length === 0 || status.type !== "playing") break;
  const result = findBestMove(mateState, { depth: 3, timeMs: 500 });
  if (!result) break;
  mateState = makeMove(mateState, result.move, { record: false });
}
check("퀸과 킹으로 외통을 만든다", mated, `${mateState.fullmoveNumber}수째`);

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
