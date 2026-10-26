import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { argumentsFrom, createProgressReporter, classifyCrawlerFatal, runCrawlerCli } from "../src/ops/crawl-cli.js";

test("CLI defaults continue without automatic campaign, host, section, depth or time caps", () => {
  assert.deepEqual(argumentsFrom(["--token-stdin", "--apply"]), {
    apply: true, rebase: false, tokenStdin: true, maxPages: 0, maxDepth: -1,
    perHost: 0, perSection: 0, maxDurationMs: 0,
  });
  const capped = argumentsFrom(["--token-stdin", "--max-pages", "700", "--max-depth", "0", "--per-host", "300", "--per-section", "50"]);
  assert.equal(capped.maxPages, 700);
  assert.equal(capped.maxDepth, 0);
  assert.equal(capped.perHost, 300);
  assert.equal(capped.perSection, 50);
  assert.throws(() => argumentsFrom(["--token-stdin", "--max-pages", "-1"]), /invalid-arguments/u);
  assert.throws(() => argumentsFrom(["--token-stdin", "--max-depth", "-2"]), /invalid-arguments/u);
});

test("CLI progress reports bounded fixed codes and numeric aggregates, cleans up heartbeat", () => {
  const lines = [];
  let heartbeat, canceled = 0;
  const reporter = createProgressReporter({ write: value => lines.push(value),
    schedule(callback, delay) { heartbeat = callback; assert.equal(delay, 15_000); return 7; },
    cancel(timer) { assert.equal(timer, 7); canceled++; } });
  const event = { event: "phase", phase: "connecting", attemptedThisRun: 0, stagedThisRun: 0, ingestedThisRun: 0 };
  reporter.onProgress({ ...event, url: "SECRET_URL", title: "SECRET_TITLE", token: "SECRET_TOKEN" });
  for (let index = 1; index < 25; index++) reporter.onProgress({ ...event, event: "page", phase: "crawling", attemptedThisRun: index });
  assert.equal(lines.length, 1);
  heartbeat();
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^Crawler crawling: attempted=24 staged=0 ingested=0\n$/u);
  reporter.onProgress({ ...event, phase: "SECRET_PHASE" });
  reporter.onProgress({ ...event, attemptedThisRun: "SECRET_COUNT" });
  reporter.onProgress({ ...event, event: "SECRET_EVENT" });
  heartbeat();
  assert.equal(lines.join("").includes("SECRET"), false);
  reporter.close(); reporter.close(); heartbeat(); reporter.onProgress(event);
  assert.equal(canceled, 1);
  assert.equal(lines.length, 3);
});

test("CLI progress output failure does not throw or keep a closed timer active", () => {
  let heartbeat;
  const reporter = createProgressReporter({ write() { throw new Error("stdout closed"); },
    schedule(callback) { heartbeat = callback; return 1; }, cancel() {} });
  assert.doesNotThrow(() => reporter.onProgress({ event: "checkpoint", phase: "applying",
    attemptedThisRun: 25, stagedThisRun: 25, ingestedThisRun: 0 }));
  assert.doesNotThrow(() => heartbeat());
  reporter.close();
});

test('CLI startup and stop diagnostics retain only bounded counters and fixed allowlisted details', () => {
  const lines = []; let heartbeat;
  const reporter = createProgressReporter({ write: value => lines.push(value),
    schedule(callback) { heartbeat = callback; return 1; }, cancel() {} });
  const counters = { attemptedThisRun: 0, stagedThisRun: 0, ingestedThisRun: 0 };
  reporter.onProgress({ ...counters, event: 'catalog-page', phase: 'connecting', catalogPages: 25,
    catalogSources: 2500, url: 'PRIVATE URL' });
  heartbeat();
  assert.match(lines[0], /catalogPages=25 catalogSources=2500/u);
  reporter.onProgress({ ...counters, event: 'read-retry', phase: 'connecting', retry: 2,
    delayMs: 4000, readError: 'conflict', error: 'PRIVATE ERROR' });
  reporter.onProgress({ ...counters, event: 'ingest-failed', phase: 'applying', ingestError: 'unavailable',
    ingestDetail: 'status-cancelled:authority-expired' });
  reporter.onProgress({ ...counters, event: 'ingest-failed', phase: 'applying', ingestError: 'unavailable',
    ingestDetail: 'PRIVATE SUBJECT' });
  assert.ok(lines.includes('Crawler read retry: conflict attempt=2 delayMs=4000\n'));
  assert.ok(lines.includes('Crawler ingest detail: status-cancelled:authority-expired\n'));
  assert.equal(lines.join('').includes('PRIVATE'), false);
  reporter.close();
});

test("fatal classification distinguishes SQLite memory errors without retaining raw error material",()=>{
  const error=Object.assign(new Error("PRIVATE_URL PRIVATE_TOKEN PRIVATE_SQL"),{code:"ERR_SQLITE_ERROR",errcode:7,
    errstr:"PRIVATE_DATABASE_PATH",cause:{message:"PRIVATE_CAUSE"}});
  assert.deepEqual(classifyCrawlerFatal(error),{name:"Error",code:"ERR_SQLITE_ERROR",sqliteCode:7,sqlitePrimary:"SQLITE_NOMEM"});
  assert.deepEqual(classifyCrawlerFatal({name:"PRIVATE_NAME",code:"PRIVATE_CODE",errcode:7}),{name:"unknown",code:"unknown"});
  assert.equal(JSON.stringify(classifyCrawlerFatal(error)).includes("PRIVATE"),false);
  assert.deepEqual(classifyCrawlerFatal(Object.assign(new TypeError("SECRET"),{code:"ERR_INVALID_ARG_TYPE"})),{name:"TypeError",code:"ERR_INVALID_ARG_TYPE"});
  assert.deepEqual(classifyCrawlerFatal({name:"Error",code:"ERR_SQLITE_ERROR",errcode:517}),{name:"Error",code:"ERR_SQLITE_ERROR",sqliteCode:517,sqlitePrimary:"SQLITE_BUSY"});
});

test("native SQLite extended errors expose their fixed class without database error text",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE private_example (id INTEGER PRIMARY KEY); INSERT INTO private_example VALUES (1)");
    assert.throws(()=>db.exec("INSERT INTO private_example VALUES (1)"),error=>{
      const value=classifyCrawlerFatal(error);assert.equal(value.code,"ERR_SQLITE_ERROR");assert.equal(value.sqlitePrimary,"SQLITE_CONSTRAINT");
      assert.equal(value.sqliteCode&255,19);assert.equal(JSON.stringify(value).includes("private_example"),false);return true;
    });
  }finally{db.close();}
});

test("fatal diagnostics never execute getters, inherited hooks, or proxy traps",()=>{
  let hooks=0;
  const hostile={};for(const key of ["name","code","errcode","message","stack"])Object.defineProperty(hostile,key,{get(){hooks++;throw new Error("PRIVATE_GETTER");}});
  assert.deepEqual(classifyCrawlerFatal(hostile),{name:"unknown",code:"unknown"});
  const prototype={};Object.defineProperty(prototype,"name",{get(){hooks++;return "PRIVATE_INHERITED";}});
  assert.deepEqual(classifyCrawlerFatal(Object.create(prototype)),{name:"unknown",code:"unknown"});
  const proxy=new Proxy({},new Proxy({},{get(){hooks++;throw new Error("PRIVATE_PROXY");}}));
  assert.deepEqual(classifyCrawlerFatal(proxy),{name:"unknown",code:"unknown"});
  const revoked=Proxy.revocable({},{});revoked.revoke();assert.deepEqual(classifyCrawlerFatal(revoked.proxy),{name:"unknown",code:"unknown"});
  assert.equal(hooks,0);
  for(const value of [null,undefined,1,"PRIVATE",Symbol("PRIVATE")])assert.deepEqual(classifyCrawlerFatal(value),{name:"unknown",code:"unknown"});
});

test("CLI fatal handler also refuses inspection hooks while preserving cleanup and exit status",async()=>{
  const priorExit=process.exitCode,lines=[];let hooks=0,closed=0;
  const hostile=new Proxy({},{get(){hooks++;throw new Error("PRIVATE_PROXY");},getOwnPropertyDescriptor(){hooks++;throw new Error("PRIVATE_DESCRIPTOR");},getPrototypeOf(){hooks++;throw new Error("PRIVATE_PROTOTYPE");}});
  try{
    await runCrawlerCli({args:["--token-stdin"],tokenReader:async()=>"PRIVATE_TOKEN",write:()=>{},errorWrite:value=>lines.push(value),
      clientFactory:()=>({knownSourceUrls:async()=>{},ingest:async()=>{},close:()=>{closed++;}}),embedderFactory:()=>{throw hostile;}});
    assert.equal(hooks,0);assert.equal(closed,1);assert.equal(process.exitCode,1);
    const diagnostic=JSON.parse(lines[1].slice("Crawler fatal: ".length));assert.equal(diagnostic.name,"unknown");assert.equal(diagnostic.code,"unknown");
    assert.equal(lines.join("").includes("PRIVATE"),false);
  }finally{process.exitCode=priorExit;}
});

test("CLI fatal output preserves generic stop line and adds only safe class and phase; resources close",async()=>{
  const priorExit=process.exitCode,lines=[],closed=[];
  try{
    await runCrawlerCli({args:["--token-stdin"],tokenReader:async()=>"PRIVATE_TOKEN",write:()=>{},errorWrite:value=>lines.push(value),
      clientFactory:()=>({knownSourceUrls:async()=>{throw Object.assign(new Error("PRIVATE_URL"),{code:"ERR_SQLITE_ERROR",errcode:7});},ingest:async()=>{},close:()=>closed.push("client")}),
      embedderFactory:()=>({embed:async()=>{},close:()=>closed.push("embedder")}),
      stateFactory:()=>Object.fromEntries(["enqueue","markExisting","next","claimRedirect","stage","terminal","listStaged","listIngestedVectors","markIngested","duplicateFor","bindGeneration","getPolicy","setPolicy","lastRequestAt","noteRequest","counts","attemptedCount","selectionCounts","close"].map(name=>[name,()=>{if(name==="close")closed.push("state");}]))});
    assert.equal(lines[0],"Crawler stopped: crawler-failed\n");
    const diagnostic=JSON.parse(lines[1].slice("Crawler fatal: ".length));
    assert.equal(diagnostic.sqlitePrimary,"SQLITE_NOMEM");assert.equal(diagnostic.progress.phase,"connecting");assert.equal(diagnostic.progress.attemptedThisRun,0);
    assert.equal(lines.join("").includes("PRIVATE"),false);assert.deepEqual(closed,["state","embedder","client"]);assert.equal(process.exitCode,1);
  }finally{process.exitCode=priorExit;}
});
