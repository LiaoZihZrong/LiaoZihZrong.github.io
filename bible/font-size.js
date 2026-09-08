"use strict";

(() => {
  const storageKey = "bible-font-scale";
  const scales = ["default", "large", "xlarge"];
  const labels = {
    default: "放大文字 A+",
    large: "再放大 A++",
    xlarge: "恢復預設文字",
  };
  const button = document.querySelector("#font-size-button");
  if (!button) return;

  function storedScale() {
    try {
      const value = localStorage.getItem(storageKey);
      return scales.includes(value) ? value : "default";
    } catch {
      return "default";
    }
  }

  function applyScale(scale) {
    if (scale === "default") {
      document.documentElement.removeAttribute("data-font-scale");
    } else {
      document.documentElement.dataset.fontScale = scale;
    }
    button.textContent = labels[scale];
    button.setAttribute("aria-label", `${labels[scale]}，目前為${scale === "default" ? "預設" : scale === "large" ? "大字" : "特大字"}模式`);
  }

  let currentScale = storedScale();
  applyScale(currentScale);

  button.addEventListener("click", () => {
    const nextIndex = (scales.indexOf(currentScale) + 1) % scales.length;
    currentScale = scales[nextIndex];
    applyScale(currentScale);
    try {
      localStorage.setItem(storageKey, currentScale);
    } catch {
      // The visual control still works when browser storage is unavailable.
    }
  });
})();
