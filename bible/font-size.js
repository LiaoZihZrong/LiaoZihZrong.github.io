"use strict";

(() => {
  const storageKey = "bible-font-scale";
  const scales = ["small", "default", "large", "xlarge"];
  const scaleNames = {
    small: "小字",
    default: "預設",
    large: "大字",
    xlarge: "特大字",
  };
  const decreaseButton = document.querySelector("#font-size-decrease");
  const increaseButton = document.querySelector("#font-size-button");
  const status = document.querySelector("#font-size-status");
  if (!decreaseButton || !increaseButton) return;

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
    const index = scales.indexOf(scale);
    decreaseButton.disabled = index === 0;
    increaseButton.disabled = index === scales.length - 1;
    decreaseButton.setAttribute("aria-label", `縮小文字，目前為${scaleNames[scale]}模式`);
    increaseButton.setAttribute("aria-label", `放大文字，目前為${scaleNames[scale]}模式`);
    if (status) status.textContent = `文字大小：${scaleNames[scale]}`;
  }

  let currentScale = storedScale();
  applyScale(currentScale);

  function changeScale(direction) {
    const nextIndex = Math.min(
      Math.max(scales.indexOf(currentScale) + direction, 0),
      scales.length - 1,
    );
    currentScale = scales[nextIndex];
    applyScale(currentScale);
    try {
      localStorage.setItem(storageKey, currentScale);
    } catch {
      // The visual control still works when browser storage is unavailable.
    }
  }

  decreaseButton.addEventListener("click", () => changeScale(-1));
  increaseButton.addEventListener("click", () => changeScale(1));
})();
