#!/usr/bin/env python3
"""index.html에 'Google Docs 이어 읽기' 기능 패치(7줄)를 적용한다.

- beta.html이 런타임에 덧씨우던 것과 같은 변경(베타 표시 제외)을 파일에 직접 반영
- 결과 md5가 로컬에서 검증한 값(EXPECTED_MD5)과 다르면 아무것도 쓰지 않고 실패
사용: python3 tools/readpos_patch.py index.html
"""
import hashlib, pathlib, sys

EXPECTED_MD5 = "1f913738684a749c2d096d47d3fa7b7e"   # 2026-10-09 로컬 검증본 (index.html 3ff5182 기준)

def patch(html: str) -> str:
    def rep(s, old, new):
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"patch point {'not unique' if n else 'not found'}: {old[:60]!r}")
        return s.replace(old, new)

    html = rep(html,
        'function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\\./,""); }catch(e){ return ""; } }',
        'function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\\./,""); }catch(e){ return ""; } }\n'
        '/* Google Docs 문서 링크면 문서 ID, 아니면 null — 이어 읽기(open.html) 대상 판별 */\n'
        'function docsIdOf(u){ const m = /^https?:\\/\\/docs\\.google\\.com\\/document\\/(?:u\\/\\d+\\/)?d\\/([A-Za-z0-9_-]{10,})/.exec(u || ""); return m ? m[1] : null; }')

    start = html.index("function chipEl(link, group, sub){")
    head, tail = html[:start], html[start:]
    old1 = 'chip.href = link.url; chip.target = "_blank"; chip.rel = "noopener noreferrer";'
    tail = rep(tail, old1, old1 + '\n    const dId = docsIdOf(link.url);\n'
        '    if(dId){ chip.href = "open.html?id=" + encodeURIComponent(dId) + "&n=" + encodeURIComponent(link.title || ""); chip.title = "마지막 읽은 위치에서 열기"; }')
    tail = rep(tail,
        'meta.appendChild(el("span","m", sub || link.memo || hostOf(link.url)));',
        'meta.appendChild(el("span","m", (docsIdOf(link.url) ? "📖 " : "") + (sub || link.memo || hostOf(link.url))));')
    html = head + tail

    old_btn = '  <button class="mitem" id="miExport">'
    html = rep(html, old_btn,
        '  <button class="mitem" id="miReadPos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Google Docs 이어 읽기 설정</button>\n' + old_btn)
    html = rep(html,
        '$("#miClose").addEventListener("click", ()=>$("#dlgMenu").close());',
        '$("#miClose").addEventListener("click", ()=>$("#dlgMenu").close());\n'
        '$("#miReadPos").addEventListener("click", ()=>{ $("#dlgMenu").close(); window.open("open.html?setup=1", "_blank", "noopener"); });')
    return html

def main():
    p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "index.html")
    src = p.read_bytes()
    if hashlib.md5(src).hexdigest() == EXPECTED_MD5:
        print("already patched; nothing to do"); return
    out = patch(src.decode("utf-8")).encode("utf-8")
    got = hashlib.md5(out).hexdigest()
    if got != EXPECTED_MD5:
        raise SystemExit(f"md5 mismatch: got {got}, expected {EXPECTED_MD5} — not writing")
    p.write_bytes(out)
    print(f"patched {p} ({len(out)} bytes), md5 {got} OK")

if __name__ == "__main__":
    main()
