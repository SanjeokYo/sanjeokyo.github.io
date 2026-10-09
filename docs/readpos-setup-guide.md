# Google Docs 이어 읽기 — 설치 가이드 (약 10분)

북마크 홈(「내 북마크」)에 등록한 Google Docs 문서를 PC·폰 어디서 열어도 **마지막 읽은 위치**에서 이어 읽는 기능입니다.

## 0. 동작 원리 (한눈에)

1. 읽다가 멈출 때, 그 자리에 **마커 `,,,`** 를 입력합니다. (문서 본문이므로 Google이 모든 기기로 동기화)
2. 북마크 홈에서 그 문서를 누르면 중간 페이지 `open.html`이 열리고, **리졸버**(Apps Script 웹 앱)를 호출합니다.
3. 리졸버가 문서에서 `,,,`를 찾아 그 자리에 **북마크**를 만들고, 마커 글자와 이전 북마크를 지운 뒤 북마크 ID를 돌려줍니다.
4. `open.html`이 `…/edit#bookmark=<ID>` 주소로 문서를 엽니다. PC는 자동, 폰은 "📖 이어 읽기" 버튼 한 번.

| 구성 요소 | 위치 | 역할 |
|---|---|---|
| `beta.html` | GitHub Pages | 북마크 홈 (index.html + Docs 링크 인식) |
| `open.html` | GitHub Pages | 홈 → 문서 사이의 중간 페이지, 설정 화면 |
| `apps-script/resolver.gs` | 내 Google 계정의 Apps Script | 마커 → 북마크 변환 |
| Firestore `bookmarks/settings`, `bookmarks/readpos` | Firebase | 연결 설정, 문서별 마지막 위치 |

적용 범위: **북마크 홈에서 눌러서 연 문서만**. 백그라운드 실행은 없고, 호출된 문서 1개만 다룹니다. 마커가 없으면 문서를 전혀 수정하지 않습니다.

---

## 1부. 리졸버 배포 (Apps Script)

북마크 홈에 로그인하는 **같은 Google 계정**으로 진행합니다.

1. <https://script.google.com> → **새 프로젝트**. 왼쪽 위 제목을 눌러 이름을 `북마크 이어읽기 리졸버`로 바꿉니다.
2. 편집기의 `Code.gs` 내용을 모두 지우고, 이 저장소의 `apps-script/resolver.gs` 전체를 붙여넣은 뒤 저장(Ctrl+S).
3. 왼쪽 **프로젝트 설정(⚙)** → 아래 **스크립트 속성** → *스크립트 속성 추가*
   - 속성: `KEY`
   - 값: 비밀키 (영문·숫자 12자 이상, 예: `rp-7f3k9q2m8x4z`) → **저장**
   - 이 값은 2부에서 북마크 홈 설정에 똑같이 입력합니다.
4. **권한 승인**: 편집기 상단 함수 선택 상자에서 `selfTest` 선택 → **▶ 실행** → "권한 검토" → 계정 선택 → "Google에서 확인하지 않은 앱" 경고가 나오면 *고급* → *(안전하지 않음)으로 이동* → **허용**.
   실행 로그에 `{"ok":true,"pong":true,…,"keySet":true}`가 보이면 정상입니다.
5. **배포** → *새 배포* → 유형 선택(⚙) → **웹 앱**
   - 설명: `v1`
   - 실행 사용자: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
   - **배포** → 표시되는 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사해 둡니다.
6. 확인: 브라우저 새 탭에 `웹앱URL?action=ping`을 열면 `{"ok":true,"pong":true,"version":"…","keySet":true}`가 나와야 합니다.

> 코드를 수정한 뒤에는 **배포 → 배포 관리 → ✏ → 버전: 새 버전 → 배포**. URL은 그대로 유지됩니다.

---

## 2부. 북마크 홈 연결 (1회)

1. PC에서 <https://sanjeokyo.github.io/beta.html> 접속(로그인 상태) → 오른쪽 위 **⋮ 설정** → **Google Docs 이어 읽기 설정**.
2. 설정 화면에 입력:
   - 리졸버 주소: 1부 5단계의 `…/exec` URL
   - 비밀키: 1부 3단계의 `KEY` 값
   - 마커: `,,,` (기본값)
3. **연결 테스트** → `연결됨 (v…) · 비밀키 설정됨` 확인 → **저장**.
4. 설정은 내 계정의 Firestore에 저장되므로 폰에서는 다시 입력할 필요가 없습니다. 폰에서는 `beta.html` → 설정 → 이어 읽기 설정에서 **모바일 열기 방식**만 고릅니다. (Docs 앱 설치 폰: *Docs 앱*)

---

## 3부. 사용법

- 북마크 홈에 Google Docs 문서 링크(`https://docs.google.com/document/d/…`)를 북마크로 등록합니다. 메모 줄에 **📖** 가 보이면 인식된 것입니다.
- **멈출 때**: 그 자리에 `,,,` 입력.
  - PC: 자리 클릭 → `,,,` 타이핑
  - Docs 앱: ✏(편집) → 자리 탭 → `,,,` 입력
- **이어 읽기**: 홈에서 📖 북마크 클릭 → "위치 확인 중…"(2~4초) → PC는 자동으로 열림, 폰은 **📖 이어 읽기** 버튼 탭 → Docs 앱이 그 자리에서 열림.
- 마커는 북마크로 바뀐 뒤 자동 삭제됩니다. 마커가 여러 개면 문서 순서상 **가장 뒤의 것**을 쓰고 모두 지웁니다.
- 리졸버에 연결되지 않으면 마지막으로 저장된 위치로, 그것도 없으면 처음부터 엽니다. 최후의 수단: 문서에서 `,,,` 찾기(Ctrl+F).

---

## 4부. 문제가 생겼을 때

| 메시지 | 원인·조치 |
|---|---|
| `Firestore 규칙이 막고 있어서 …` | Firebase 콘솔 → Firestore → **규칙**에서 `bookmarks` 컬렉션 전체가 허용되는지 확인 (아래 예시). |
| `요청이 차단됐어요` / `응답을 해석할 수 없어요` | 배포 액세스 권한이 **모든 사용자**인지, 주소가 `/exec`로 끝나는지 확인. |
| `unauthorized` | 비밀키가 스크립트 속성 `KEY`와 다름. |
| `이전 북마크가 문서에 없어요` | 북마크를 직접 지운 경우. 다음 `,,,`부터 정상. |
| 폰에서 위치로 안 감 | 북마크 ID 형식 확인: `웹앱URL?action=info&doc=문서ID&key=KEY` 로 북마크 목록을 보고, Docs의 "북마크 링크 복사" 형식과 비교. |

규칙 예시 (이미 이런 형태면 수정 불필요):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bookmarks/{docId} {
      allow read, write: if request.auth != null
                         && request.auth.token.email == "내이메일@gmail.com";
    }
  }
}
```

`main`, `notes` 같은 특정 문서만 허용하는 형태라면 `settings`, `readpos` 두 문서를 추가하거나 위처럼 `{docId}`로 바꿉니다.

---

## 5부. 보안 메모

- 리졸버 URL과 비밀키는 Firestore `bookmarks/settings`(내 계정만 읽기 가능)에만 저장합니다. **공개 저장소의 HTML에는 넣지 않습니다.**
- 리졸버는 '모든 사용자' 접근이지만 비밀키 없이는 아무것도 하지 않고, 키가 있어도 할 수 있는 일은 "문서의 마커 글자 삭제 + 북마크 생성/삭제"뿐입니다.
- 트리거·백그라운드 실행이 없습니다. 홈에서 북마크를 눌렀을 때만, 그 문서 하나만 다룹니다.

## 6부. 데이터 구조

- `bookmarks/settings` → `{ readpos: { url, key, marker, updatedAt } }`
- `bookmarks/readpos` → `{ <문서ID>: { bm, tab, multiTab, title, snippet, para, at, opened, dev } }`
  - `bm` 북마크 ID · `tab` 탭 ID(탭 문서만) · `snippet` 위치 뒤 80자 · `para` 본문 문단 번호 · `at` 위치 저장 시각 · `opened` 마지막 열람 · `dev` pc/mobile
  - `snippet`·`para`는 나중에 "읽기 모드(B안)"를 붙일 때 그대로 재사용합니다.

## 7부. 리졸버 API (참고)

| 호출 | 설명 |
|---|---|
| `?action=ping` | 연결 확인 (키 불필요) |
| `?action=info&doc=ID&key=KEY` | 제목·탭·북마크 목록 (수정 없음) |
| `?action=resolve&doc=ID&key=KEY[&prev=북마크ID][&marker=,,,][&dry=1]` | 마커 → 북마크. `dry=1`이면 찾기만 함 |
