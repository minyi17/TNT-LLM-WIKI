(() => {
  "use strict";

  const pages = Array.isArray(window.WIKI_PAGES) ? window.WIKI_PAGES : [];
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const article = document.getElementById("article");
  const navigation = document.getElementById("navigation");
  const breadcrumb = document.getElementById("breadcrumb");
  const searchInput = document.getElementById("siteSearch");
  const searchResults = document.getElementById("searchResults");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const searchBox = document.querySelector(".search-box");

  const categoryNames = {
    overview: "總覽",
    members: "成員",
    discography: "音樂作品",
    events: "重要事件",
    shows: "綜藝節目",
    concepts: "專有概念",
    comparisons: "專題分析",
    sources: "來源摘要"
  };

  const memberOrder = ["馬嘉祺", "丁程鑫", "宋亞軒", "劉耀文", "張真源", "嚴浩翔", "賀峻霖"];
  let currentPageId = "overview";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[`*_~]/g, "")
      .replace(/[()[\]{}「」『』《》〈〉，。！？、：；"'.,!?;:]/g, "")
      .replace(/\s+/g, "-");
  }

  function normalizeTarget(target) {
    return target
      .trim()
      .replace(/^wiki\//, "")
      .replace(/\.md$/i, "")
      .replace(/\\/g, "/");
  }

  function findPage(target) {
    const key = normalizeTarget(target);
    if (pageById.has(key)) return pageById.get(key);

    const matches = pages.filter((page) =>
      page.id.split("/").pop() === key || page.title === key
    );
    return matches.length ? matches[0] : null;
  }

  function makeHash(pageId, anchor) {
    const encodedId = pageId.split("/").map(encodeURIComponent).join("/");
    const section = anchor ? `?section=${encodeURIComponent(anchor)}` : "";
    return `#/${encodedId}${section}`;
  }

  function renderWikiLink(body, tokenStore) {
    const separator = body.indexOf("|");
    const target = (separator < 0 ? body : body.slice(0, separator)).replace(/\\+$/, "");
    const rawLabel = separator < 0 ? "" : body.slice(separator + 1);
    const [pageTarget, ...anchorParts] = target.split("#");
    const anchor = anchorParts.join("#");
    const page = findPage(pageTarget);
    const targetName = pageTarget.split("/").pop();
    const label = page && (!rawLabel || rawLabel === targetName)
      ? page.title
      : rawLabel || targetName;

    let markup;
    if (page) {
      markup = `<a class="wiki-link" href="${makeHash(page.id, anchor)}" data-page-link="${escapeHtml(page.id)}"${anchor ? ` data-page-anchor="${escapeHtml(anchor)}"` : ""}>${escapeHtml(label)}</a>`;
    } else {
      markup = `<span class="wiki-link missing" title="此詞條尚未建立">${escapeHtml(label)}</span>`;
    }

    const token = `WIKITOKEN${tokenStore.length}END`;
    tokenStore.push(markup);
    return token;
  }

  function renderInline(source) {
    const tokens = [];
    let prepared = String(source)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt) => {
        const token = `WIKITOKEN${tokens.length}END`;
        tokens.push(`<span class="image-fallback">圖片：${escapeHtml(alt || "未提供替代文字")}</span>`);
        return token;
      })
      .replace(/\[\[([^\]]+)\]\]/g, (_match, body) => renderWikiLink(body, tokens));

    let html = escapeHtml(prepared);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/WIKITOKEN(\d+)END/g, (_match, index) => tokens[Number(index)] || "");
    return html;
  }

  function stripFrontmatter(markdown) {
    return String(markdown).replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  function splitTableRow(line) {
    const cells = [];
    let cell = "";
    let inWikiLink = false;

    for (let index = 0; index < line.length; index += 1) {
      const pair = line.slice(index, index + 2);
      if (pair === "[[") {
        inWikiLink = true;
        cell += pair;
        index += 1;
      } else if (pair === "]]") {
        inWikiLink = false;
        cell += pair;
        index += 1;
      } else if (line[index] === "|" && !inWikiLink) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += line[index];
      }
    }
    cells.push(cell.trim());
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    return cells;
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
  }

  function isListLine(line) {
    return /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || "";
    return /^\s*$/.test(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^```/.test(line) ||
      /^\s*>/.test(line) ||
      /^\s*\|/.test(line) ||
      isListLine(line) ||
      /^---+\s*$/.test(line);
  }

  function renderTable(lines, start) {
    const rows = [];
    let index = start;
    while (index < lines.length && /^\s*\|/.test(lines[index])) {
      rows.push(splitTableRow(lines[index]));
      index += 1;
    }
    if (rows.length < 2 || !isTableSeparator(lines[start + 1] || "")) {
      return null;
    }

    const header = rows[0];
    const bodyRows = rows.slice(2);
    const headHtml = header.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join("");
    const bodyHtml = bodyRows.map((row) => {
      const cells = header.map((_cell, cellIndex) =>
        `<td>${renderInline(row[cellIndex] || "")}</td>`
      ).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    return {
      html: `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      nextIndex: index
    };
  }

  function renderQuote(lines, start) {
    const content = [];
    let index = start;
    while (index < lines.length && /^\s*>/.test(lines[index])) {
      content.push(lines[index].replace(/^\s*>\s?/, ""));
      index += 1;
    }

    const firstLine = content[0] || "";
    const callout = firstLine.match(/^\[!(\w+)\]\s*(.*)$/);
    if (callout) {
      const title = callout[1].toLowerCase() === "warning" ? "資訊註記" : callout[1];
      const paragraphs = [callout[2], ...content.slice(1)].filter(Boolean);
      return {
        html: `<aside class="callout"><div class="callout-title">${escapeHtml(title)}</div><p>${renderInline(paragraphs.join(" "))}</p></aside>`,
        nextIndex: index
      };
    }

    return {
      html: `<blockquote><p>${renderInline(content.join(" "))}</p></blockquote>`,
      nextIndex: index
    };
  }

  function renderList(lines, start) {
    const firstMatch = lines[start].match(/^\s*(?:([-*+])|(\d+\.))\s+(.*)$/);
    const ordered = Boolean(firstMatch[2]);
    const tag = ordered ? "ol" : "ul";
    const items = [];
    let index = start;

    while (index < lines.length) {
      const match = lines[index].match(/^\s*(?:([-*+])|(\d+\.))\s+(.*)$/);
      if (!match || Boolean(match[2]) !== ordered) break;
      items.push(`<li>${renderInline(match[3])}</li>`);
      index += 1;
    }
    return { html: `<${tag}>${items.join("")}</${tag}>`, nextIndex: index };
  }

  function renderMarkdown(markdown) {
    const lines = stripFrontmatter(markdown).replace(/\r\n/g, "\n").split("\n");
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const title = heading[2].trim();
        output.push(`<h${level} id="${escapeHtml(slugify(title))}" data-heading-anchor="${escapeHtml(title)}">${renderInline(title)}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^```/.test(line)) {
        const language = line.slice(3).trim();
        const code = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        index += 1;
        output.push(`<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      const table = /^\s*\|/.test(line) ? renderTable(lines, index) : null;
      if (table) {
        output.push(table.html);
        index = table.nextIndex;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quote = renderQuote(lines, index);
        output.push(quote.html);
        index = quote.nextIndex;
        continue;
      }

      if (isListLine(line)) {
        const list = renderList(lines, index);
        output.push(list.html);
        index = list.nextIndex;
        continue;
      }

      if (/^---+\s*$/.test(line)) {
        output.push("<hr>");
        index += 1;
        continue;
      }

      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && !isBlockStart(lines, index)) {
        paragraph.push(lines[index].trim());
        index += 1;
      }
      output.push(`<p>${renderInline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
    }

    return output.join("\n");
  }

  function pageCategory(page) {
    if (page.id === "overview") return "團體總覽";
    return categoryNames[page.category] || "Wiki 條目";
  }

  function createNavLink(page, icon) {
    return `<a class="nav-link" href="${makeHash(page.id)}" data-page-link="${escapeHtml(page.id)}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(page.title)}</span></a>`;
  }

  function sortMembers(members) {
    return members.sort((left, right) => {
      const leftIndex = memberOrder.indexOf(left.title);
      const rightIndex = memberOrder.indexOf(right.title);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
  }

  function renderNavigation() {
    const overview = pageById.get("overview");
    const members = sortMembers(pages.filter((page) => page.category === "members"));
    const albums = pages.filter((page) => page.category === "discography").sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
    const events = pages.filter((page) => page.category === "events").sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
    const others = pages.filter((page) => ["shows", "concepts", "comparisons", "sources"].includes(page.category))
      .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));

    const sections = [];
    if (overview) {
      sections.push(`<section class="nav-section"><h2 class="nav-section-title">起點</h2>${createNavLink(overview, "⌂")}</section>`);
    }
    if (members.length) {
      sections.push(`<section class="nav-section"><h2 class="nav-section-title">成員</h2>${members.map((page) => createNavLink(page, "✦")).join("")}</section>`);
    }
    if (albums.length) {
      sections.push(`<section class="nav-section"><h2 class="nav-section-title">音樂作品</h2>${albums.map((page) => createNavLink(page, "♫")).join("")}</section>`);
    }
    if (events.length) {
      sections.push(`<section class="nav-section"><h2 class="nav-section-title">重要事件／演唱會</h2>${events.map((page) => createNavLink(page, "◷")).join("")}</section>`);
    }
    if (others.length) {
      sections.push(`<section class="nav-section"><h2 class="nav-section-title">其他詞條</h2>${others.map((page) => createNavLink(page, "↗")).join("")}</section>`);
    }
    navigation.innerHTML = sections.join("");
  }

  function renderMemberCards() {
    const members = sortMembers(pages.filter((page) => page.category === "members"));
    if (!members.length) return;

    const section = document.createElement("section");
    section.className = "member-grid";
    section.setAttribute("aria-label", "成員檔案");
    section.innerHTML = members.map((page) =>
      `<a class="member-card" href="${makeHash(page.id)}" data-page-link="${escapeHtml(page.id)}"><strong>${escapeHtml(page.title)}</strong><span>查看成員檔案　↗</span></a>`
    ).join("");

    const firstParagraph = article.querySelector("p");
    if (firstParagraph) firstParagraph.insertAdjacentElement("afterend", section);
    else article.prepend(section);
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  function updateActiveNavigation() {
    navigation.querySelectorAll("[data-page-link]").forEach((link) => {
      if (link.dataset.pageLink === currentPageId) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function renderPage(pageId, anchor) {
    const page = pageById.get(pageId) || pageById.get("overview") || pages[0];
    if (!page) {
      article.innerHTML = "<p>尚無可顯示的 Wiki 頁面。請先執行 <code>build-site.ps1</code> 產生內容清單。</p>";
      return;
    }

    currentPageId = page.id;
    breadcrumb.textContent = `時代少年團 / ${pageCategory(page)}`;
    document.title = `${page.title}｜時代少年團 Wiki`;
    article.innerHTML = renderMarkdown(page.markdown);
    if (page.id === "overview") renderMemberCards();
    updateActiveNavigation();

    if (anchor) {
      window.requestAnimationFrame(() => {
        const heading = Array.from(article.querySelectorAll("[data-heading-anchor]"))
          .find((element) => element.dataset.headingAnchor === anchor || element.id === slugify(anchor));
        if (heading) heading.scrollIntoView({ block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function readRoute() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) return { pageId: "overview", anchor: "" };
    const [encodedPath, query = ""] = raw.split("?");
    let pageId;
    try {
      pageId = encodedPath.split("/").map(decodeURIComponent).join("/");
    } catch (_error) {
      pageId = "overview";
    }
    const params = new URLSearchParams(query);
    return { pageId, anchor: params.get("section") || "" };
  }

  function navigateTo(pageId, anchor) {
    if (!pageById.has(pageId)) return;
    const hash = makeHash(pageId, anchor);
    if (window.location.hash === hash) {
      renderPage(pageId, anchor);
    } else {
      window.location.hash = hash;
    }
    closeSidebar();
    searchResults.classList.remove("is-visible");
  }

  function renderSearchResults(query) {
    const value = query.trim().toLocaleLowerCase();
    if (!value) {
      searchResults.classList.remove("is-visible");
      searchResults.innerHTML = "";
      return;
    }

    const matches = pages
      .map((page) => {
        const title = page.title.toLocaleLowerCase();
        const bodyMatch = page.markdown.toLocaleLowerCase().includes(value);
        const score = title === value ? 0 : title.startsWith(value) ? 1 : title.includes(value) ? 2 : bodyMatch ? 3 : Infinity;
        return { page, score };
      })
      .filter((match) => Number.isFinite(match.score))
      .sort((left, right) => left.score - right.score || left.page.title.localeCompare(right.page.title, "zh-Hant"))
      .slice(0, 8)
      .map((match) => match.page);

    const content = matches.length
      ? matches.map((page) => `<a class="search-result" href="${makeHash(page.id)}" data-page-link="${escapeHtml(page.id)}"><span>${escapeHtml(page.title)}</span><small>${escapeHtml(pageCategory(page))}</small></a>`).join("")
      : `<div class="search-empty">沒有找到符合「${escapeHtml(query)}」的頁面。</div>`;
    searchResults.innerHTML = `<div class="search-results-heading">搜尋結果</div>${content}`;
    searchResults.classList.add("is-visible");
  }

  renderNavigation();
  renderPage(readRoute().pageId, readRoute().anchor);

  window.addEventListener("hashchange", () => {
    const route = readRoute();
    renderPage(route.pageId, route.anchor);
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-page-link]");
    if (!link) return;
    event.preventDefault();
    navigateTo(link.dataset.pageLink, link.dataset.pageAnchor || "");
  });

  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchInput.value = "";
      renderSearchResults("");
      searchBox.classList.remove("search-active");
      searchInput.blur();
    }
  });
  searchBox.addEventListener("click", () => {
    if (window.innerWidth <= 560) {
      searchBox.classList.add("search-active");
      searchInput.focus();
    }
  });
  searchInput.addEventListener("blur", () => {
    if (!searchInput.value.trim()) searchBox.classList.remove("search-active");
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("sidebar-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
  sidebarBackdrop.addEventListener("click", closeSidebar);
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("[data-page-link]") && window.innerWidth <= 820) closeSidebar();
  });
})();
