/**
 * perft: 깊이 N까지의 합법수 잎 노드 수를 센다.
 * 알려진 값과 다르면 규칙 어딘가가 틀린 것이다. 엔진보다 이 테스트가 먼저다.
 *
 *   node tests/perft.js
 */

import { parseFEN, START_FEN, toFEN } from "../js/board.js";
import { generateLegalMoves, moveToUCI } from "../js/moves.js";
import { makeMove, undoMove } from "../js/rules.js";

function perft(state, depth) {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(state);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    nodes += perft(makeMove(state, move, { record: false }), depth - 1);
  }
  return nodes;
}

/** 수별 노드 수. 값이 어긋날 때 어느 가지가 범인인지 찾는 용도. */
export function perftDivide(fen, depth) {
  const state = parseFEN(fen);
  const rows = [];
  for (const move of generateLegalMoves(state)) {
    rows.push([
      moveToUCI(move),
      perft(makeMove(state, move, { record: false }), depth - 1),
    ]);
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]));
}

const SUITES = [
  {
    name: "시작 위치",
    fen: START_FEN,
    expected: [20, 400, 8902, 197281],
  },
  {
    name: "Kiwipete",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    expected: [48, 2039, 97862],
  },
  {
    name: "엔드게임 (앙파상/프로모션 경로)",
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    expected: [14, 191, 2812, 43238],
  },
  {
    name: "프로모션 난전",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    expected: [6, 264, 9467],
  },
  {
    name: "좁은 국면",
    fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    expected: [44, 1486, 62379],
  },
];

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  const mark = ok ? "  ok" : "FAIL";
  console.log(`${mark}  ${label}: ${actual}${ok ? "" : ` (기대값 ${expected})`}`);
}

console.log("perft");
for (const suite of SUITES) {
  console.log(`\n[${suite.name}]`);
  const state = parseFEN(suite.fen);
  suite.expected.forEach((expected, i) => {
    check(`depth ${i + 1}`, perft(state, i + 1), expected);
  });
}

console.log("\n[상태 전이]");
const roundTrip = toFEN(parseFEN(START_FEN));
check("FEN 라운드트립", roundTrip === START_FEN ? 1 : 0, 1);

// 두고 되돌리면 원래 FEN으로 돌아와야 한다.
let undoOk = 1;
const base = parseFEN("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
const baseFEN = toFEN(base);
for (const move of generateLegalMoves(base)) {
  const after = makeMove(base, move);
  const back = undoMove(after);
  if (toFEN(back) !== baseFEN) {
    console.log(`     되돌리기 실패: ${moveToUCI(move)} -> ${toFEN(back)}`);
    undoOk = 0;
  }
}
check("makeMove/undoMove 왕복 (48수)", undoOk, 1);

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
