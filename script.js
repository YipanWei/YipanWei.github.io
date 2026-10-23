const yearNode = document.querySelector("#year");

const siteTitle = document.querySelector(".site-title");
if (siteTitle) {
  const brand = document.createElement("div");
  brand.className = "site-brand";
  siteTitle.before(brand);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "theme-toggle";
  toggle.setAttribute("aria-label", "Terminal theme");
  /* Lucide square-terminal, https://lucide.dev, ISC License.
   * Copyright (c) 2026 Lucide Icons and Contributors
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   */
  toggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg><span class="theme-tooltip" aria-hidden="true"></span>';
  brand.append(siteTitle, toggle);
  const tooltip = toggle.querySelector(".theme-tooltip");

  function applyTheme(terminal) {
    if (terminal) document.documentElement.dataset.theme = "terminal";
    else delete document.documentElement.dataset.theme;
    toggle.setAttribute("aria-pressed", String(terminal));
    tooltip.textContent = terminal ? "Classic theme" : "Terminal theme";
  }

  let savedTheme;
  try { savedTheme = localStorage.getItem("yipanwei-theme"); } catch { /* Storage may be disabled. */ }
  applyTheme(savedTheme === "terminal");
  toggle.addEventListener("click", () => {
    const terminal = document.documentElement.dataset.theme !== "terminal";
    applyTheme(terminal);
    try {
      if (terminal) localStorage.setItem("yipanwei-theme", "terminal");
      else localStorage.removeItem("yipanwei-theme");
    } catch { /* The toggle still works without persistence. */ }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "yipanwei-theme" || event.key === null) {
      applyTheme(event.newValue === "terminal");
    }
  });
}

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealNodes = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window) {
  document.documentElement.classList.add("has-reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}
