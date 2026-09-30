# 픽스처 라이선스

저장소 코드는 MIT(루트 `LICENSE`)이고, 이 폴더의 픽스처 기사와 골든셋 라벨은 따로 CC-BY-4.0이다.

- **CC-BY-4.0**: 이 폴더 전체(아래 GDELT 데이터 부분만 예외).
  - 데모 사건 `demo-*/`: 운영자가 직접 쓴 가상 기사·가상 출처와 그 정답(폴더마다 `LICENSE.md`).
  - 기록 픽스처 `live-*/`, `gnews/`, `gnews-recheck/`, `gdelt/`, `openai/`: 실제 API 응답의 모양을 기록한 뒤 기사 제목·설명·본문·URL·매체 이름과 기록된 모델 응답의 문장을 운영자가 직접 쓴 가상 텍스트로 바꿨다. 실제 기사 문장은 들어 있지 않다.
  - 골든셋 목록 `golden-set.json`, 모든 `golden/` 폴더의 라벨.
- **예외 — GDELT 데이터**: `gdelt/*/files.txt`의 파일 목록 줄과 GKG 행의 기록 식별자·시각은 The GDELT Project(https://www.gdeltproject.org) 공개 데이터이며, 출처를 밝히는 조건으로 제한 없이 쓸 수 있는 원 조건을 따른다.
