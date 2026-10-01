export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="editorial-page">
      <header className="flex flex-col gap-3">
        <h1>페이지를 찾을 수 없습니다</h1>
        <p>주소를 확인하거나 오늘의 사건 목록에서 다시 찾아보세요.</p>
      </header>
      <a href="/" className="inline-flex min-h-11 items-center self-start">
        오늘의 사건으로
      </a>
    </main>
  );
}
