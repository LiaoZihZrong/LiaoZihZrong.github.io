"use strict";

const elements = {
  testament: document.querySelector("#testament-select"),
  book: document.querySelector("#book-select"),
  chapter: document.querySelector("#chapter-select"),
  status: document.querySelector("#status"),
  reading: document.querySelector("#reading"),
  navigation: document.querySelector("#chapter-navigation"),
  previous: document.querySelector("#previous-button"),
  next: document.querySelector("#next-button"),
  badge: document.querySelector("#testament-badge"),
  title: document.querySelector("#chapter-title"),
  meta: document.querySelector("#chapter-meta"),
  verses: document.querySelector("#verses"),
};

let books = [];
let activeRequest = null;

function booksInTestament(testament) {
  return books.filter((book) => book.testament === testament);
}

function currentBook() {
  return books.find((book) => book.name_en === elements.book.value);
}

function populateBooks(preferredBook) {
  const choices = booksInTestament(elements.testament.value);
  elements.book.replaceChildren(
    ...choices.map((book) => new Option(book.name_zh, book.name_en)),
  );

  if (choices.some((book) => book.name_en === preferredBook)) {
    elements.book.value = preferredBook;
  }
}

function populateChapters(preferredChapter = 1) {
  const book = currentBook();
  if (!book) return;

  elements.chapter.replaceChildren(
    ...Array.from(
      { length: book.chapters },
      (_, index) => new Option(`第 ${index + 1} 章`, String(index + 1)),
    ),
  );
  const chapter = Math.min(Math.max(Number(preferredChapter) || 1, 1), book.chapters);
  elements.chapter.value = String(chapter);
}

function chapterPath(book, chapter) {
  const safePath = book.api_path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `data/${safePath}/${String(chapter).padStart(3, "0")}.json`;
}

function setLoading(message = "正在載入經文⋯⋯") {
  elements.reading.classList.add("d-none");
  elements.navigation.classList.add("d-none");
  elements.status.className = "status-panel text-center py-5";
  elements.status.innerHTML = "";

  const spinner = document.createElement("div");
  spinner.className = "spinner-border";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("p");
  text.className = "mt-3 mb-0";
  text.textContent = message;
  elements.status.append(spinner, text);
}

function showError(error) {
  elements.reading.classList.add("d-none");
  elements.navigation.classList.add("d-none");
  elements.status.className = "alert alert-danger shadow-sm";
  elements.status.replaceChildren();

  const title = document.createElement("h2");
  title.className = "h5";
  title.textContent = "經文載入失敗";
  const detail = document.createElement("p");
  detail.className = "mb-0";
  detail.textContent = `${error.message}。請確認網站是透過 HTTP 伺服器開啟，而不是直接開啟本機 HTML 檔案。`;
  elements.status.append(title, detail);
}

function renderChapter(data) {
  elements.badge.textContent = data.testament_zh;
  elements.title.textContent = `${data.book_zh} 第 ${data.chapter} 章`;
  elements.meta.textContent = `本章共 ${data.verse_count} 節`;
  elements.verses.replaceChildren(
    ...data.verses.map((verse) => {
      const row = document.createElement("p");
      row.className = "verse-row";
      row.id = `verse-${verse.verse}`;

      const number = document.createElement("span");
      number.className = "verse-number";
      number.textContent = verse.verse;
      number.setAttribute("aria-label", `第 ${verse.verse} 節`);

      const text = document.createElement("span");
      text.textContent = verse.text;
      row.append(number, text);
      return row;
    }),
  );

  elements.status.classList.add("d-none");
  elements.reading.classList.remove("d-none");
  elements.navigation.classList.remove("d-none");
  updateNavigation();
}

function updateAddress(book, chapter) {
  const url = new URL(window.location.href);
  url.searchParams.set("book", book.name_en);
  url.searchParams.set("chapter", String(chapter));
  history.replaceState(null, "", url);
  document.title = `${book.name_zh} 第 ${chapter} 章｜ZZ聖經經文閱讀`;
}

async function loadChapter({ scroll = false } = {}) {
  const book = currentBook();
  const chapter = Number(elements.chapter.value);
  if (!book || !chapter) return;

  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  setLoading();

  try {
    const response = await fetch(chapterPath(book, chapter), {
      signal: activeRequest.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderChapter(data);
    updateAddress(book, chapter);
    if (scroll) elements.reading.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error.name !== "AbortError") showError(error);
  }
}

function adjacentChapter(direction) {
  const book = currentBook();
  const chapter = Number(elements.chapter.value);
  const bookIndex = books.findIndex((candidate) => candidate.name_en === book.name_en);

  if (direction < 0 && chapter > 1) return { book, chapter: chapter - 1 };
  if (direction > 0 && chapter < book.chapters) return { book, chapter: chapter + 1 };

  const adjacentBook = books[bookIndex + direction];
  if (!adjacentBook) return null;
  return {
    book: adjacentBook,
    chapter: direction < 0 ? adjacentBook.chapters : 1,
  };
}

function updateNavigation() {
  elements.previous.disabled = !adjacentChapter(-1);
  elements.next.disabled = !adjacentChapter(1);
}

function goToAdjacentChapter(direction) {
  const target = adjacentChapter(direction);
  if (!target) return;

  elements.testament.value = target.book.testament;
  populateBooks(target.book.name_en);
  populateChapters(target.chapter);
  loadChapter({ scroll: true });
}

function enableSelectors() {
  elements.testament.disabled = false;
  elements.book.disabled = false;
  elements.chapter.disabled = false;
}

async function initialize() {
  try {
    const response = await fetch("data/convert_list.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    books = manifest.books;

    const query = new URLSearchParams(window.location.search);
    const requestedBook = books.find((book) => book.name_en === query.get("book"));
    const initialBook = requestedBook || books[0];
    elements.testament.value = initialBook.testament;
    populateBooks(initialBook.name_en);
    populateChapters(query.get("chapter"));
    enableSelectors();
    await loadChapter();
  } catch (error) {
    showError(error);
  }
}

elements.testament.addEventListener("change", () => {
  populateBooks();
  populateChapters();
  loadChapter();
});

elements.book.addEventListener("change", () => {
  populateChapters();
  loadChapter();
});

elements.chapter.addEventListener("change", () => loadChapter());
elements.previous.addEventListener("click", () => goToAdjacentChapter(-1));
elements.next.addEventListener("click", () => goToAdjacentChapter(1));

initialize();
