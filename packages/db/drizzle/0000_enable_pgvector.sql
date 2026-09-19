-- #16 첫 마이그레이션: pgvector 확장 활성화만 담는다. 도메인 테이블은 M1.
CREATE EXTENSION IF NOT EXISTS vector;
