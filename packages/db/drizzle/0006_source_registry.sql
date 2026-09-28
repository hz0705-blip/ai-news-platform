ALTER TABLE "sources" ADD COLUMN "domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "is_wire" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "is_excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 기존 GNews 출처 행의 어휘를 출처 표(#76)와 맞춘다: 소유 형태 `unknown`, 지역 `미확인`, 언어 ISO 639-1. 데모의 가상 출처는 두지 않는다.
UPDATE "sources" SET "ownership" = 'unknown' WHERE "is_fictional" = false AND "ownership" = '불명';--> statement-breakpoint
UPDATE "sources" SET "region" = '미확인' WHERE "is_fictional" = false AND "region" = '불명';--> statement-breakpoint
UPDATE "sources" SET "language" = 'en' WHERE "is_fictional" = false AND "language" = '영어';
