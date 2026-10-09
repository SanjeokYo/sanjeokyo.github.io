/**
 * 내 북마크 · Google Docs 이어 읽기 리졸버 (Apps Script 웹 앱)
 * ────────────────────────────────────────────────────────────────
 * 역할: 북마크 홈(open.html)에서 문서를 열 때 호출되어
 *   1) 문서 본문에서 마커(기본 ",,,")를 찾고
 *   2) 그 자리에 북마크를 만든 뒤 마커 글자와 이전 북마크를 지우고
 *   3) 새 북마크 ID를 돌려준다.  → 홈은 …/edit#bookmark=<ID> 로 연다.
 *
 * 수정 범위: 호출된 문서 1개, 그 안의 마커 글자와 "이 시스템이 만든" 북마크만.
 *   - 백그라운드 실행(트리거) 없음. 북마크 홈에서 눌렀을 때만 동작.
 *   - 마커가 없으면 문서를 전혀 수정하지 않는다.
 *
 * 배포: 배포 > 새 배포 > 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 * 설정: 프로젝트 설정 > 스크립트 속성 > KEY = (아무 긴 문자열, 홈 설정에 같은 값 입력)
 *
 * 액션 (GET/POST 모두 쿼리 파라미터):
 *   action=ping                                   연결 확인 (키 불필요)
 *   action=info&doc=ID&key=KEY                    문서 제목·탭·북마크 목록 (수정 없음)
 *   action=resolve&doc=ID&key=KEY                 마커 → 북마크 변환
 *       [&prev=이전북마크ID] [&marker=,,,] [&dry=1]   dry=1 이면 찾기만 하고 수정 없음
 */

var VERSION = "2026-10-09.1";
var DEFAULT_MARKER = ",,,";
var SNIPPET_LEN = 80;      // 위치 뒤 미리보기 글자 수 (나중에 읽기 모드에서 재사용)

function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    var key = PropertiesService.getScriptProperties().getProperty("KEY") || "";
    if (p.action === "ping") {
      out = { ok: true, pong: true, version: VERSION, time: new Date().toISOString(), keySet: !!key };
    } else if (!key) {
      out = { ok: false, error: "KEY가 설정되지 않았어요. 프로젝트 설정 > 스크립트 속성에 KEY를 추가하세요." };
    } else if (p.key !== key) {
      out = { ok: false, error: "unauthorized" };
    } else if (p.action === "info") {
      out = info_(p.doc);
    } else if (p.action === "resolve") {
      out = resolve_(p.doc, clean_(p.prev), p.marker || DEFAULT_MARKER, p.dry === "1");
    } else {
      out = { ok: false, error: "unknown action" };
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── 핵심 로직 ───────────────────────── */

function resolve_(docId, prevId, marker, dry) {
  if (!docId) throw new Error("doc 파라미터가 없어요");
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);                       // PC·폰 동시 호출 보호
  try {
    var doc = DocumentApp.openById(docId);
    var tabs = tabsOf_(doc);
    var multiTab = tabs.length > 1;
    var pattern = escapeRe_(marker);

    // 1) 탭별 마커 개수 (탭 순서 = 문서 순서)
    var hits = [], total = 0;
    for (var i = 0; i < tabs.length; i++) {
      var n = countHits_(tabs[i].docTab.getBody(), pattern);
      hits.push(n); total += n;
    }

    var res = {
      ok: true, docId: docId, title: doc.getName(), marker: marker,
      markers: total, changed: false, dry: !!dry, multiTab: multiTab,
      bookmarkId: prevId || null, tabId: null, snippet: "", para: -1
    };

    // 2) 마커 없음 → 수정 없이 이전 북마크 유효성만 확인
    if (!total) {
      if (prevId) {
        var kept = findBookmark_(tabs, prevId);
        if (kept) res.tabId = kept.tab.id;
        else { res.bookmarkId = null; res.note = "이전 북마크가 문서에 없어요(직접 지웠을 수 있음)"; }
      }
      res.url = buildUrl_(docId, res.tabId, res.bookmarkId, multiTab);
      return res;
    }

    // 3) 대상 = 마커가 있는 마지막 탭의 마지막 마커 (문서 순서상 가장 뒤)
    var ti = tabs.length - 1;
    while (ti > 0 && !hits[ti]) ti--;
    var target = tabs[ti];
    var body = target.docTab.getBody();
    var r = nthHit_(body, pattern, hits[ti] - 1);
    var tEl = r.getElement().asText();
    var s = r.getStartOffsetInclusive(), en = r.getEndOffsetInclusive();
    var full = tEl.getText();
    res.snippet = full.substring(en + 1, en + 1 + SNIPPET_LEN).trim() ||
                  full.substring(Math.max(0, s - SNIPPET_LEN), s).trim();
    res.para = paraIndex_(body, tEl);
    res.tabId = target.id;

    if (dry) {
      res.url = buildUrl_(docId, res.tabId, prevId || null, multiTab);
      return res;
    }

    // 4) 대상 마커 하나만 남기고 나머지 마커 삭제 (항상 '첫 번째'를 지우므로 마지막 것이 남음)
    for (var k = 0; k < tabs.length; k++) {
      var keep = (k === ti) ? 1 : 0;
      deleteHits_(tabs[k].docTab.getBody(), pattern, hits[k] - keep);
    }

    // 5) 남은 마커를 다시 찾아 삭제하고, 그 자리에 북마크 생성
    var r2 = body.findText(pattern);
    if (!r2) throw new Error("마커를 다시 찾지 못했어요");
    var el2 = r2.getElement().asText();
    var s2 = r2.getStartOffsetInclusive(), e2 = r2.getEndOffsetInclusive();
    removeRange_(el2, s2, e2);
    var bm = target.docTab.addBookmark(target.docTab.newPosition(el2, s2));

    // 6) 이전 북마크(이 시스템이 만든 것만) 제거
    if (prevId && prevId !== bm.getId()) {
      var old = findBookmark_(tabs, prevId);
      if (old) old.bookmark.remove();
    }

    res.changed = true;
    res.bookmarkId = bm.getId();
    res.url = buildUrl_(docId, res.tabId, res.bookmarkId, multiTab);
    return res;
  } finally {
    lock.releaseLock();
  }
}

function info_(docId) {
  if (!docId) throw new Error("doc 파라미터가 없어요");
  var doc = DocumentApp.openById(docId);
  var tabs = tabsOf_(doc);
  var out = { ok: true, docId: docId, title: doc.getName(), url: doc.getUrl(), multiTab: tabs.length > 1, tabs: [] };
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    out.tabs.push({
      id: t.id, title: t.title,
      bookmarks: t.docTab.getBookmarks().map(function (b) { return b.getId(); }),
      chars: t.docTab.getBody().getText().length
    });
  }
  return out;
}

/* ───────────────────────── 도우미 ───────────────────────── */

/** 문서의 모든 탭(하위 탭 포함)을 [{id, title, docTab}]로. 탭 API가 없으면 문서 자체를 하나의 탭처럼 취급. */
function tabsOf_(doc) {
  var list = [];
  if (typeof doc.getTabs === "function") {
    var walk = function (tabs) {
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        try {
          if (String(t.getType()) === "DOCUMENT_TAB")
            list.push({ id: t.getId(), title: t.getTitle(), docTab: t.asDocumentTab() });
        } catch (e) {}
        try { if (typeof t.getChildTabs === "function") walk(t.getChildTabs()); } catch (e) {}
      }
    };
    try { walk(doc.getTabs()); } catch (e) {}
  }
  if (!list.length) list.push({ id: null, title: "", docTab: doc });
  return list;
}

function countHits_(body, pattern) {
  var n = 0, r = body.findText(pattern);
  while (r) { n++; r = body.findText(pattern, r); }
  return n;
}

function nthHit_(body, pattern, idx) {
  var r = body.findText(pattern);
  for (var i = 0; i < idx && r; i++) r = body.findText(pattern, r);
  return r;
}

function deleteHits_(body, pattern, count) {
  for (var i = 0; i < count; i++) {
    var r = body.findText(pattern);
    if (!r) break;
    removeRange_(r.getElement().asText(), r.getStartOffsetInclusive(), r.getEndOffsetInclusive());
  }
}

/** 텍스트 요소에서 [s, e] 구간 삭제. 요소 전체가 마커면 빈 문자열로 (빈 줄만 남음). */
function removeRange_(tEl, s, e) {
  var len = tEl.getText().length;
  if (s === 0 && e >= len - 1) tEl.setText("");
  else tEl.deleteText(s, e);
}

function findBookmark_(tabs, id) {
  for (var i = 0; i < tabs.length; i++) {
    var b = null;
    try { b = tabs[i].docTab.getBookmark(id); } catch (e) { b = null; }
    if (b) return { tab: tabs[i], bookmark: b };
  }
  return null;
}

/** 요소가 속한 본문 최상위 자식(문단/표 등)의 인덱스. */
function paraIndex_(body, el) {
  try {
    var cur = el, parent = cur.getParent();
    while (parent && parent.getType() !== DocumentApp.ElementType.BODY_SECTION) {
      cur = parent; parent = cur.getParent();
    }
    return parent ? parent.getChildIndex(cur) : -1;
  } catch (e) { return -1; }
}

function buildUrl_(docId, tabId, bmId, multiTab) {
  var url = "https://docs.google.com/document/d/" + docId + "/edit";
  if (multiTab && tabId) url += "?tab=" + encodeURIComponent(tabId);
  if (bmId) url += "#bookmark=" + bmId;
  return url;
}

function escapeRe_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function clean_(v) {
  v = (v == null) ? "" : String(v).trim();
  return (v === "null" || v === "undefined") ? "" : v;
}

/** 편집기에서 ▶ 실행용: 권한 승인 + 자가 점검 로그 */
function selfTest() {
  var r = handle_({ parameter: { action: "ping" } }).getContent();
  Logger.log(r);
  return r;
}
