/**
 * Supabase 연동 통합 테스트
 * 실행: node scripts/test-supabase.mjs
 */

import https from "https";

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNycWZwZnR2aW1semxmemd5bmRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDg2MTcsImV4cCI6MjA5MDUyNDYxN30.Fx5vhQWPilrKZzN_nMRHcp_kHfpR56IhjcsPLWHJldE";

// ── HTTP 헬퍼 ──────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const opts = {
      hostname: "srqfpftvimlzlfzgyndh.supabase.co",
      path,
      method,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token || ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=ignore-duplicates",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null })
      );
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── 결과 테이블 출력 ──────────────────────────────────────
const results = [];

function record(scenario, action, expected, actual, pass) {
  results.push({ scenario, action, expected, actual, pass });
}

function printTable() {
  const col = [28, 30, 28, 36, 6];
  const headers = ["시나리오", "액션", "기대값", "실제값", "결과"];
  const line = col.map((w) => "─".repeat(w)).join("┼");

  const pad = (str, w) => {
    const s = String(str ?? "");
    // 한글 2바이트 보정
    let len = 0;
    for (const c of s) len += c.charCodeAt(0) > 127 ? 2 : 1;
    return s + " ".repeat(Math.max(0, w - len));
  };

  console.log("\n" + "═".repeat(col.reduce((a, b) => a + b + 1) + 1));
  console.log("  SUPABASE 통합 테스트 결과");
  console.log("═".repeat(col.reduce((a, b) => a + b + 1) + 1));
  console.log(headers.map((h, i) => pad(h, col[i])).join("│"));
  console.log(line);

  for (const r of results) {
    const icon = r.pass ? "✅ PASS" : "❌ FAIL";
    console.log(
      [
        pad(r.scenario, col[0]),
        pad(r.action, col[1]),
        pad(r.expected, col[2]),
        pad(r.actual, col[3]),
        pad(icon, col[4]),
      ].join("│")
    );
  }
  console.log("═".repeat(col.reduce((a, b) => a + b + 1) + 1));

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  총 ${results.length}개 테스트  |  통과 ${pass}개  |  실패 ${results.length - pass}개\n`);
}

// ── 테스트 본체 ───────────────────────────────────────────
async function main() {
  console.log("\n🔍 Supabase 연동 테스트 시작...\n");

  // ── T1. 익명 로그인 ──────────────────────────────────────
  const authRes = await request("POST", "/auth/v1/signup", { email: null, password: null }, null);
  const token = authRes.body?.access_token;
  const userId = authRes.body?.user?.id;

  record(
    "T1. 익명 로그인",
    "POST /auth/v1/signup",
    "HTTP 200 + access_token",
    `HTTP ${authRes.status} | token: ${token ? "있음" : "없음"}`,
    authRes.status === 200 && !!token
  );

  if (!token) {
    printTable();
    process.exit(1);
  }

  // ── T2. profiles 생성 확인 ───────────────────────────────
  const nickname = `테스트봇_${userId.slice(0, 6).toUpperCase()}`;
  await request("POST", "/rest/v1/profiles", [{ id: userId, nickname }], token);

  // upsert 후 SELECT로 실제 row 확인
  const profileCheck = await request(
    "GET",
    `/rest/v1/profiles?id=eq.${userId}&select=id,nickname`,
    null,
    token
  );
  const profileRow = profileCheck.body?.[0];

  record(
    "T2. profiles 생성",
    "POST /rest/v1/profiles",
    "user_id로 row 존재",
    profileRow ? `id: ${profileRow.id.slice(0, 8)}… | nick: ${profileRow.nickname}` : "row 없음",
    !!profileRow && profileRow.id === userId
  );

  // ── T3. ex_photos INSERT (zodiac_id 포함) ────────────────
  const photo1Id = `test-${Date.now()}-1`;
  const insertRes = await request(
    "POST",
    "/rest/v1/ex_photos",
    [
      {
        id: photo1Id,
        user_id: userId,
        file_name: "test_single.jpg",
        city: "서울",
        country: "대한민국",
        continent: "아시아",
        lat: 37.5665,
        lon: 126.978,
        zodiac_id: "cancer",
      },
    ],
    token
  );
  const insertedRow = insertRes.body?.[0];

  record(
    "T3. ex_photos INSERT",
    "zodiac_id 포함 1건 저장",
    "HTTP 201 + zodiac_id=cancer",
    `HTTP ${insertRes.status} | zodiac_id: ${insertedRow?.zodiac_id ?? "없음"}`,
    insertRes.status === 201 && insertedRow?.zodiac_id === "cancer"
  );

  // ── T4. 사진 3개 연속 INSERT ─────────────────────────────
  const ts = Date.now();
  const batch = [
    { id: `test-${ts}-a`, user_id: userId, file_name: "photo_a.jpg", city: "부산", zodiac_id: "taurus" },
    { id: `test-${ts}-b`, user_id: userId, file_name: "photo_b.jpg", city: "제주", zodiac_id: "gemini" },
    { id: `test-${ts}-c`, user_id: userId, file_name: "photo_c.jpg", city: "도쿄", zodiac_id: "leo" },
  ];

  const batchRes = await request("POST", "/rest/v1/ex_photos", batch, token);
  const batchRows = batchRes.body ?? [];

  record(
    "T4. 사진 3개 연속 INSERT",
    "batch INSERT 3건",
    "HTTP 201 + row 3개 반환",
    `HTTP ${batchRes.status} | 반환 row: ${batchRows.length}개`,
    batchRes.status === 201 && batchRows.length === 3
  );

  // ── T5. SELECT로 저장 데이터 조회 ────────────────────────
  const selectRes = await request(
    "GET",
    `/rest/v1/ex_photos?user_id=eq.${userId}&select=id,file_name,city,zodiac_id,created_at&order=created_at.asc`,
    null,
    token
  );
  const rows = selectRes.body ?? [];

  // 이번 테스트 세션에서 INSERT한 4개(1+3) 확인
  const testIds = [photo1Id, ...batch.map((b) => b.id)];
  const found = rows.filter((r) => testIds.includes(r.id));

  record(
    "T5. SELECT 조회",
    "GET /rest/v1/ex_photos",
    "이번 세션 삽입 4개 조회",
    `전체 ${rows.length}행 | 이번 세션 ${found.length}개 확인`,
    found.length === 4
  );

  // ── 결과 출력 ─────────────────────────────────────────────
  printTable();

  // 세부 데이터 출력
  console.log("📋 이번 세션 저장된 데이터:");
  console.log(
    found
      .map((r) => `  • ${r.file_name.padEnd(18)} city: ${(r.city ?? "—").padEnd(8)} zodiac: ${r.zodiac_id}`)
      .join("\n")
  );
  console.log();
}

main().catch((e) => {
  console.error("테스트 실행 오류:", e);
  process.exit(1);
});
