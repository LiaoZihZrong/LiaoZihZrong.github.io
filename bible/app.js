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
let renderedPosition = null;
let scrollSaveTimer = null;
const readingPositionCookie = "bible-reading-position";
const cookieMaxAge = 60 * 60 * 24 * 365;
const versePositionStorageKey = "bible-verse-position";
const scrollSaveDelay = 200;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function savedReadingPosition() {
  try {
    const prefix = `${readingPositionCookie}=`;
    const cookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(prefix));
    if (!cookie) return null;

    const position = JSON.parse(decodeURIComponent(cookie.slice(prefix.length)));
    if (typeof position.book !== "string") return null;
    return position;
  } catch {
    return null;
  }
}

function saveReadingPosition(book, chapter) {
  const value = encodeURIComponent(JSON.stringify({
    book: book.name_en,
    chapter,
  }));
  document.cookie = `${readingPositionCookie}=${value}; max-age=${cookieMaxAge}; path=/; SameSite=Lax`;
}

function savedVersePosition() {
  try {
    const position = JSON.parse(localStorage.getItem(versePositionStorageKey));
    if (
      typeof position.book !== "string"
      || !Number.isInteger(position.chapter)
      || !Number.isInteger(position.verse)
    ) {
      return null;
    }
    return position;
  } catch {
    return null;
  }
}

function saveCurrentVerse() {
  scrollSaveTimer = null;
  if (!renderedPosition || elements.reading.classList.contains("d-none")) return;

  const verseRows = elements.verses.querySelectorAll(".verse-row");
  if (!verseRows.length) return;

  const readingLine = window.innerHeight / 2;
  let currentVerse = verseRows[0];
  for (const verseRow of verseRows) {
    if (verseRow.getBoundingClientRect().top > readingLine) break;
    currentVerse = verseRow;
  }

  try {
    localStorage.setItem(versePositionStorageKey, JSON.stringify({
      ...renderedPosition,
      verse: Number(currentVerse.dataset.verse),
    }));
  } catch {
    // Reading continues normally when browser storage is unavailable.
  }
}

function scheduleVersePositionSave() {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveCurrentVerse, scrollSaveDelay);
}

function restoreVersePosition(book, chapter) {
  const position = savedVersePosition();
  if (position?.book !== book.name_en || position.chapter !== chapter) return false;

  const verse = elements.verses.querySelector(`#verse-${position.verse}`);
  if (!verse) return false;

  requestAnimationFrame(() => {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    verse.scrollIntoView({ block: "center" });
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
  });
  return true;
}

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
      row.dataset.verse = String(verse.verse);

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

async function loadChapter({ scroll = false, restorePosition = false } = {}) {
  const book = currentBook();
  const chapter = Number(elements.chapter.value);
  if (!book || !chapter) return;

  if (activeRequest) activeRequest.abort();
  activeRequest = new AbortController();
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
  }
  setLoading();

  try {
    const response = await fetch(chapterPath(book, chapter), {
      signal: activeRequest.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderChapter(data);
    renderedPosition = { book: book.name_en, chapter };
    updateAddress(book, chapter);
    saveReadingPosition(book, chapter);
    const restored = restorePosition && restoreVersePosition(book, chapter);
    if (scroll && !restored) {
      elements.reading.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    const requestedBookName = query.get("book");
    const requestedBook = books.find((book) => book.name_en === requestedBookName);
    const savedPosition = requestedBookName ? null : savedReadingPosition();
    const savedBook = books.find((book) => book.name_en === savedPosition?.book);
    const initialBook = requestedBook || savedBook || books[0];
    const initialChapter = requestedBook
      ? query.get("chapter")
      : savedPosition?.chapter;
    elements.testament.value = initialBook.testament;
    populateBooks(initialBook.name_en);
    populateChapters(initialChapter);
    enableSelectors();
    await loadChapter({ restorePosition: true });
  } catch (error) {
    showError(error);
  }
}

elements.testament.addEventListener("change", () => {
  populateBooks();
  populateChapters();
  loadChapter({ scroll: true });
});

elements.book.addEventListener("change", () => {
  populateChapters();
  loadChapter({ scroll: true });
});

elements.chapter.addEventListener("change", () => loadChapter({ scroll: true }));
elements.previous.addEventListener("click", () => goToAdjacentChapter(-1));
elements.next.addEventListener("click", () => goToAdjacentChapter(1));
window.addEventListener("scroll", scheduleVersePositionSave, { passive: true });
window.addEventListener("pagehide", saveCurrentVerse);

initialize();
