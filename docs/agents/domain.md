# 도메인 문서

엔지니어링 스킬이 코드베이스를 탐색할 때 이 저장소의 도메인 문서를 어떻게 읽어야 하는지.

## 탐색 전에 읽을 것

- 저장소 루트의 **`CONTEXT.md`**, 또는
- 루트에 **`CONTEXT-MAP.md`**가 있으면 그것. 컨텍스트별 `CONTEXT.md`를 가리키므로 주제에 관련된 것을 각각 읽는다.
- **`docs/adr/`**: 작업할 영역에 관련된 ADR을 읽는다. 다중 컨텍스트 저장소에서는 `src/<context>/docs/adr/`의 컨텍스트별 결정도 확인한다.

이 파일들이 없으면 **조용히 진행한다.** 없다고 지적하거나 미리 만들자고 제안하지 않는다. `/domain-modeling` 스킬(`/grill-with-docs`, `/improve-codebase-architecture`를 통해 도달)이 용어나 결정이 실제로 확정될 때 지연 생성한다.

## 파일 구조

단일 컨텍스트 저장소(대부분):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

다중 컨텍스트 저장소(루트에 `CONTEXT-MAP.md`가 있을 때):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 시스템 전체 결정
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 컨텍스트별 결정
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 용어집의 어휘를 쓴다

산출물(이슈 제목, 리팩터링 제안, 가설, 테스트 이름)에서 도메인 개념을 부를 때는 `CONTEXT.md`에 정의된 용어를 쓴다. 용어집이 명시적으로 피하는 동의어로 흘러가지 않는다.

필요한 개념이 용어집에 없다면 신호다. 프로젝트가 쓰지 않는 언어를 만들어내고 있거나(재고할 것), 실제 공백이 있는 것이다(`/domain-modeling`용으로 기록).

## ADR 충돌은 드러낸다

산출물이 기존 ADR과 충돌하면 조용히 덮어쓰지 말고 명시적으로 드러낸다:

> _ADR-0007(이벤트 소싱 주문)과 충돌하지만, 다시 열어볼 가치가 있다. 이유는…_
