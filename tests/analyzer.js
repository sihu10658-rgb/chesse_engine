/**
 * 수 분석기 테스트. 평가 점수와 후보수 분류를 본다.
 *
 *   node tests/analyzer.js
 */

import { createStartPosition, parseFEN, squareToIndex } from "../js/board.js";
import {
  PIECE_VALUES,
  analyze,
  countMaterial,
  evaluate,
  formatScore,
} from "../js/analyzer.js";

let failures = 0;

function check(label, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "  ok" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

function sanList(report) {
  return report.moves.map((entry) => entry.san);
}

console.log("수 분석기");

console.log("\n[정적 평가]");
const start = createStartPosition();
const startMaterial = countMaterial(start.board);
const expected = PIECE_VALUES.pawn * 8 + PIECE_VALUES.knight * 2 +
  PIECE_VALUES.bishop * 2 + PIECE_VALUES.rook * 2 + PIECE_VALUES.queen;
check(
  "시작 위치 기물 합 4000 대칭",
  startMaterial.w === expected && startMaterial.b === expected,
  `${startMaterial.w} vs ${startMaterial.b}`,
);
check("시작 위치 평가 0", evaluate(start) === 0, String(evaluate(start)));
check(
  "흑 퀸이 없으면 +900",
  evaluate(parseFEN("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")) === 900,
);
check(
  "백 룩이 없으면 -500",
  evaluate(parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1")) === -500,
);
check("점수 표기", formatScore(0) === "0.00" && formatScore(150) === "+1.50", formatScore(150));
check("음수 점수 표기", formatScore(-320) === "−3.20", formatScore(-320));

console.log("\n[후보수 분류]");
const startReport = analyze(start);
check("시작 위치 합법수 20", startReport.counts.total === 20, String(startReport.counts.total));
check(
  "시작 위치엔 캡처/체크/승격 없음",
  startReport.counts.captures === 0 &&
    startReport.counts.checks === 0 &&
    startReport.counts.promotions === 0,
);
check(
  "이득이 같으면 표기순",
  sanList(startReport).slice(0, 3).join(" ") === "a3 a4 b3",
  sanList(startReport).slice(0, 3).join(" "),
);

// 백 폰 e4가 흑 퀸 d5를 잡을 수 있다. 가장 큰 이득이 맨 앞에 와야 한다.
const captureReport = analyze(
  parseFEN("rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"),
);
check("최대 이득 수가 첫 후보", captureReport.moves[0].san === "exd5", captureReport.moves[0].san);
check(
  "퀸 캡처 이득 900",
  captureReport.moves[0].gain === PIECE_VALUES.queen,
  String(captureReport.moves[0].gain),
);
check("캡처 수를 센다", captureReport.counts.captures > 0, String(captureReport.counts.captures));

const epReport = analyze(
  parseFEN("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"),
);
const epMove = epReport.moves.find((entry) => entry.san === "exf6");
check("앙파상도 캡처로 분류", Boolean(epMove?.capture && epMove.enPassant));
check("앙파상 이득 100", epMove?.gain === PIECE_VALUES.pawn, String(epMove?.gain));

const promotionReport = analyze(parseFEN("8/P6k/8/8/8/8/6K1/8 w - - 0 1"));
const queening = promotionReport.moves.find((entry) => entry.san.startsWith("a8=Q"));
check("승격 후보 4개", promotionReport.counts.promotions === 4, String(promotionReport.counts.promotions));
check("퀸 승격 이득 800", queening?.gain === 800, String(queening?.gain));
check("퀸 승격이 첫 후보", promotionReport.moves[0] === queening, promotionReport.moves[0].san);

console.log("\n[체크와 메이트]");
const mateReport = analyze(parseFEN("6k1/5ppp/8/8/8/8/8/R3K2R w KQ - 0 1"));
check("1수 메이트를 찾음", mateReport.moves[0].mate === true, mateReport.moves[0].san);
check(
  "메이트는 check가 아니라 mate로 표시 (SAN이 #로 끝난다)",
  mateReport.moves[0].check === false && mateReport.moves[0].san.endsWith("#"),
);
check("메이트 수를 센다", mateReport.counts.mates >= 1, String(mateReport.counts.mates));

const checkReport = analyze(parseFEN("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1"));
const checking = checkReport.moves.filter((entry) => entry.check);
check(
  "체크 거는 수 분류",
  checking.length > 0 && checking.every((entry) => entry.san.endsWith("+")),
  checking.map((entry) => entry.san).join(" "),
);
check(
  "체크 수를 센다",
  checkReport.counts.checks === checking.length + checkReport.counts.mates,
  String(checkReport.counts.checks),
);

console.log("\n[게임 종료 국면]");
const mated = analyze(parseFEN("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"));
check("체크메이트면 후보수 없음", mated.counts.total === 0 && mated.status === "checkmate");

console.log("\n[캐슬링]");
const castleReport = analyze(parseFEN("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1"));
check("캐슬링 2개", castleReport.counts.castles === 2, String(castleReport.counts.castles));
check(
  "캐슬링 SAN",
  castleReport.moves.filter((entry) => entry.castle).every((entry) => entry.san.startsWith("O-O")),
);
check(
  "수 객체를 그대로 들고 있다 (UI가 바로 둘 수 있게)",
  castleReport.moves[0].move.from === squareToIndex(
    castleReport.moves[0].uci.slice(0, 2),
  ),
);

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
