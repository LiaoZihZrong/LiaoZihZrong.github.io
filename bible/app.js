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
  selectorCard: document.querySelector("#selector-card"),
  selectorToggle: document.querySelector("#selector-toggle"),
  toolbar: document.querySelector("#side-toolbar"),
  fullscreen: document.querySelector("#fullscreen-button"),
  quickTabs: document.querySelector("#quick-tabs"),
  quickTabRemove: document.querySelector("#quick-tab-remove"),
  toast: document.querySelector("#toolbar-toast"),
};

let books = [];
let activeRequest = null;
let renderedPosition = null;
let scrollSaveTimer = null;
let quickTabs = [];
let removingQuickTabs = false;
let toastTimer = null;
const readingPositionCookie = "bible-reading-position";
const quickTabsCookie = "bible-quick-tabs";
const maxQuickTabs = 10;
const cookieMaxAge = 60 * 60 * 24 * 365;
const versePositionStorageKey = "bible-verse-position";
const selectorCollapsedStorageKey = "bible-selector-collapsed";
const scrollSaveDelay = 200;
const toastDuration = 2200;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function readJsonCookie(name) {
  try {
    const prefix = `${name}=`;
    const cookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(prefix));
    if (!cookie) return null;
    return JSON.parse(decodeURIComponent(cookie.slice(prefix.length)));
  } catch {
    return null;
  }
}

function writeJsonCookie(name, value) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${name}=${encoded}; max-age=${cookieMaxAge}; path=/; SameSite=Lax`;
}

function savedReadingPosition() {
  const position = readJsonCookie(readingPositionCookie);
  if (typeof position?.book !== "string") return null;
  return position;
}

function saveReadingPosition(book, chapter) {
  writeJsonCookie(readingPositionCookie, { book: book.name_en, chapter });
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

function withoutSmoothScroll(callback) {
  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  callback();
  document.documentElement.style.scrollBehavior = previousScrollBehavior;
}

function restoreVersePosition(book, chapter) {
  const position = savedVersePosition();
  if (position?.book !== book.name_en || position.chapter !== chapter) return false;

  const verse = elements.verses.querySelector(`#verse-${position.verse}`);
  if (!verse) return false;

  requestAnimationFrame(() => {
    withoutSmoothScroll(() => verse.scrollIntoView({ block: "center" }));
  });
  return true;
}

function stickySelectorHeight() {
  if (getComputedStyle(elements.selectorCard).position !== "sticky") return 0;
  return elements.selectorCard.getBoundingClientRect().height;
}

// Places the verse just below the sticky selector and briefly highlights it.
function revealVerse(verseNumber) {
  const verse = elements.verses.querySelector(`#verse-${verseNumber}`);
  if (!verse) return false;

  requestAnimationFrame(() => {
    const top = verse.getBoundingClientRect().top + window.scrollY - stickySelectorHeight() - 12;
    withoutSmoothScroll(() => window.scrollTo(0, Math.max(top, 0)));
    verse.classList.remove("is-highlighted");
    void verse.offsetWidth;
    verse.classList.add("is-highlighted");
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

      const tools = document.createElement("span");
      tools.className = "verse-tools";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "verse-add";
      addButton.dataset.verse = String(verse.verse);
      addButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
      tools.append(addButton);

      const number = document.createElement("span");
      number.className = "verse-number";
      number.textContent = verse.verse;
      number.setAttribute("aria-label", `第 ${verse.verse} 節`);

      const text = document.createElement("span");
      text.textContent = verse.text;
      row.append(tools, number, text);
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

async function loadChapter({ scroll = false, restorePosition = false, verse = null } = {}) {
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
    updateVerseAddButtons();
    updateAddress(book, chapter);
    saveReadingPosition(book, chapter);
    if (verse && revealVerse(verse)) return;
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

function bookByName(name) {
  return books.find((book) => book.name_en === name);
}

function quickTabLabel(tab) {
  return `${bookByName(tab.book).site_key}${tab.chapter}:${tab.verse}`;
}

function sameQuickTab(first, second) {
  return first.book === second.book
    && first.chapter === second.chapter
    && first.verse === second.verse;
}

function savedQuickTabs() {
  const saved = readJsonCookie(quickTabsCookie);
  if (!Array.isArray(saved)) return [];

  const tabs = [];
  for (const tab of saved) {
    const book = bookByName(tab?.book);
    const valid = book
      && Number.isInteger(tab.chapter)
      && tab.chapter >= 1
      && tab.chapter <= book.chapters
      && Number.isInteger(tab.verse)
      && tab.verse >= 1;
    if (!valid || tabs.some((existing) => sameQuickTab(existing, tab))) continue;
    tabs.push({ book: tab.book, chapter: tab.chapter, verse: tab.verse });
  }
  return tabs.slice(0, maxQuickTabs);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), toastDuration);
}

function updateVerseAddButtons() {
  for (const button of elements.verses.querySelectorAll(".verse-add")) {
    const tab = { ...renderedPosition, verse: Number(button.dataset.verse) };
    const saved = Boolean(renderedPosition) && quickTabs.some((item) => sameQuickTab(item, tab));
    const label = renderedPosition ? quickTabLabel(tab) : "";
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", saved ? `${label} 已在快捷分頁` : `將 ${label} 加入快捷分頁`);
    button.title = saved ? "已在快捷分頁" : "加入快捷分頁";
  }
}

function renderQuickTabs() {
  if (!quickTabs.length) removingQuickTabs = false;
  elements.toolbar.classList.toggle("is-removing", removingQuickTabs);
  elements.quickTabRemove.disabled = !quickTabs.length;
  elements.quickTabRemove.setAttribute("aria-pressed", String(removingQuickTabs));
  elements.quickTabRemove.title = removingQuickTabs ? "完成移除" : "移除快捷分頁";
  elements.quickTabRemove.setAttribute("aria-label", elements.quickTabRemove.title);

  elements.quickTabs.replaceChildren(
    ...quickTabs.map((tab, index) => {
      const book = bookByName(tab.book);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-tab";
      button.dataset.index = String(index);
      button.title = `${book.name_zh} ${tab.chapter}:${tab.verse}`;
      button.setAttribute(
        "aria-label",
        `${removingQuickTabs ? "移除" : "前往"} ${book.name_zh} ${tab.chapter}:${tab.verse}`,
      );

      const bookName = document.createElement("span");
      bookName.textContent = book.site_key;
      const reference = document.createElement("span");
      reference.textContent = `${tab.chapter}:${tab.verse}`;
      button.append(bookName, reference);
      item.append(button);
      return item;
    }),
  );
  updateVerseAddButtons();
}

function saveQuickTabs() {
  writeJsonCookie(quickTabsCookie, quickTabs);
  renderQuickTabs();
}

function addQuickTab(verse) {
  if (!renderedPosition) return;
  const tab = { ...renderedPosition, verse };
  const label = quickTabLabel(tab);

  if (quickTabs.some((item) => sameQuickTab(item, tab))) {
    showToast(`${label} 已在快捷分頁`);
    return;
  }
  if (quickTabs.length >= maxQuickTabs) {
    showToast(`快捷分頁最多 ${maxQuickTabs} 個，請先按左方「−」移除`);
    return;
  }
  quickTabs.push(tab);
  saveQuickTabs();
  showToast(`已加入 ${label}`);
}

function removeQuickTab(index) {
  const [removed] = quickTabs.splice(index, 1);
  if (!removed) return;
  saveQuickTabs();
  showToast(`已移除 ${quickTabLabel(removed)}`);
}

function setRemovingQuickTabs(removing) {
  removingQuickTabs = removing && quickTabs.length > 0;
  renderQuickTabs();
  if (removingQuickTabs) showToast("點選要移除的分頁，完成後再按一次「−」");
}

function openQuickTab(tab) {
  const book = bookByName(tab.book);
  const showingChapter = renderedPosition?.book === tab.book
    && renderedPosition.chapter === tab.chapter
    && !elements.reading.classList.contains("d-none");
  if (showingChapter) {
    revealVerse(tab.verse);
    return;
  }

  elements.testament.value = book.testament;
  populateBooks(book.name_en);
  populateChapters(tab.chapter);
  loadChapter({ verse: tab.verse });
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function updateFullscreenButton() {
  const active = Boolean(fullscreenElement());
  elements.toolbar.classList.toggle("is-fullscreen", active);
  elements.fullscreen.setAttribute("aria-pressed", String(active));
  elements.fullscreen.setAttribute("aria-label", active ? "離開全螢幕" : "進入全螢幕");
  elements.fullscreen.title = active ? "離開全螢幕" : "全螢幕";
}

async function toggleFullscreen() {
  const root = document.documentElement;
  try {
    if (fullscreenElement()) {
      await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    } else {
      await (root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen());
    }
  } catch {
    showToast("此瀏覽器無法切換全螢幕");
  }
}

function setupFullscreen() {
  const supported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  elements.fullscreen.hidden = !supported;
  if (!supported) return;

  elements.fullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
  updateFullscreenButton();
}

function setSelectorCollapsed(collapsed) {
  elements.selectorCard.classList.toggle("is-collapsed", collapsed);
  elements.selectorToggle.textContent = collapsed ? "展開" : "縮起";
  elements.selectorToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.selectorToggle.setAttribute("aria-label", collapsed ? "展開經文選擇" : "縮起經文選擇");
}

function setupSelectorToggle() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(selectorCollapsedStorageKey) === "1";
  } catch {
    // Starts expanded when browser storage is unavailable.
  }
  setSelectorCollapsed(collapsed);

  elements.selectorToggle.addEventListener("click", () => {
    collapsed = !elements.selectorCard.classList.contains("is-collapsed");
    setSelectorCollapsed(collapsed);
    try {
      localStorage.setItem(selectorCollapsedStorageKey, collapsed ? "1" : "0");
    } catch {
      // The toggle still works for this visit.
    }
  });
}

// Pads page content on narrow screens so the fixed toolbar never covers it.
function setupToolbarSpacing() {
  const targets = [
    document.querySelector(".site-header .container"),
    document.querySelector("main"),
    document.querySelector(".site-footer .container"),
  ].filter(Boolean);
  const phoneLayout = window.matchMedia("(max-width: 575.98px)");

  function update() {
    const gap = phoneLayout.matches ? 4 : 8;
    const toolbarRight = elements.toolbar.getBoundingClientRect().right;
    document.documentElement.style.setProperty("--toolbar-right", `${toolbarRight}px`);
    for (const target of targets) {
      target.style.removeProperty("padding-left");
      const naturalPadding = parseFloat(getComputedStyle(target).paddingLeft);
      const needed = toolbarRight + gap - target.getBoundingClientRect().left;
      if (needed > naturalPadding) target.style.paddingLeft = `${needed}px`;
    }
  }

  const observer = new ResizeObserver(update);
  observer.observe(elements.toolbar);
  for (const target of targets) observer.observe(target, { box: "border-box" });
  window.addEventListener("resize", update);
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
    quickTabs = savedQuickTabs();
    renderQuickTabs();

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

elements.verses.addEventListener("click", (event) => {
  const button = event.target.closest(".verse-add");
  if (button) addQuickTab(Number(button.dataset.verse));
});

elements.quickTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".quick-tab");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (removingQuickTabs) {
    removeQuickTab(index);
  } else if (quickTabs[index]) {
    openQuickTab(quickTabs[index]);
  }
});

elements.quickTabRemove.addEventListener("click", () => setRemovingQuickTabs(!removingQuickTabs));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && removingQuickTabs) setRemovingQuickTabs(false);
});

setupFullscreen();
setupSelectorToggle();
setupToolbarSpacing();
initialize();
