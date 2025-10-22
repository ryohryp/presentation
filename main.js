'use strict';

class SlideDeckApp {

  constructor(root, source) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    this.source = normalizeMarkdownSource(source);
    this.state = {
      slides: [],
      title: 'プレゼンテーション',
      current: 0,
      overviewOpen: false,
      syncingHash: false,
    };
    this.elements = {};
    this.animationFrameHandles = new WeakMap();
    if (this.root) {
      this.init();
    }
  }

  async init() {
    this.root.innerHTML = '<div class="loader">スライドを準備中…</div>';
    try {

      const markdown = await loadDeckMarkdown(this.source);
      const deck = parseMarkdownSlides(markdown);
      if (!deck.slides.length) {
        throw new Error('スライドデータが見つかりませんでした。');
      }
      this.state.slides = deck.slides;
      this.state.title = deck.title;
      this.render();
      const initialIndex = this.getIndexFromHash();
      this.goTo(Number.isFinite(initialIndex) ? initialIndex : 0, { skipHash: true });
      window.addEventListener('keydown', (event) => this.handleKeydown(event));
      window.addEventListener('hashchange', () => this.handleHashChange());
    } catch (error) {
      this.renderError(error);
      console.error(error);
    }
  }

  render() {
    const { slides, title } = this.state;
    const deck = document.createElement('div');
    deck.className = 'deck';

    const header = document.createElement('header');
    header.className = 'deck__header';

    const titleEl = document.createElement('div');
    titleEl.className = 'deck__title';
    titleEl.textContent = title;

    const meta = document.createElement('div');
    meta.className = 'deck__meta';

    const progress = document.createElement('div');
    progress.className = 'deck__progress';

    const progressText = document.createElement('span');
    progressText.className = 'deck__progress-text';
    progressText.textContent = `1 / ${slides.length}`;

    const progressBar = document.createElement('div');
    progressBar.className = 'deck__progress-bar';

    const progressFill = document.createElement('span');
    progressBar.append(progressFill);

    progress.append(progressText, progressBar);

    const actions = document.createElement('div');
    actions.className = 'deck__actions';

    const overviewButton = document.createElement('button');
    overviewButton.type = 'button';
    overviewButton.setAttribute('aria-expanded', 'false');
    overviewButton.setAttribute('aria-controls', 'deck-overview');
    overviewButton.textContent = '一覧表示';
    overviewButton.addEventListener('click', () => this.toggleOverview());

    actions.append(overviewButton);

    meta.append(progress, actions);

    header.append(titleEl, meta);

    const stage = document.createElement('div');
    stage.className = 'deck__stage';
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-live', 'polite');
    stage.setAttribute('aria-label', 'プレゼンテーションスライド');

    const slideElements = slides.map((slide, index) => {
      const section = document.createElement('section');
      section.className = 'slide';
      section.setAttribute('data-index', index);
      section.setAttribute('tabindex', '-1');

      const heading = document.createElement('h2');
      const [rawLabel, rawTitle] = splitSlideHeading(slide.title);
      if (rawTitle) {
        heading.innerHTML = `
          <span class="slide__eyebrow">${escapeHtml(rawLabel)}</span>
          <span class="slide__headline">${escapeHtml(rawTitle)}</span>
        `;
      } else {
        heading.textContent = rawLabel;
      }

      const content = document.createElement('div');
      content.className = 'slide__content';
      content.innerHTML = slide.html;

      section.append(heading, content);
      return section;
    });

    slideElements.forEach((slide) => stage.appendChild(slide));

    const overview = document.createElement('aside');
    overview.className = 'deck__overview';
    overview.id = 'deck-overview';
    overview.setAttribute('aria-hidden', 'true');

    const overviewList = document.createElement('ol');
    overviewList.className = 'deck__overview-list';

    const overviewItems = slides.map((slide, index) => {
      const item = document.createElement('li');
      item.className = 'deck__overview-item';
      item.setAttribute('data-index', index);

      const indexEl = document.createElement('span');
      indexEl.className = 'deck__overview-index';
      indexEl.textContent = index + 1;

      const titleEl = document.createElement('span');
      titleEl.className = 'deck__overview-title';
      const [, titleText] = splitSlideHeading(slide.title);
      titleEl.textContent = titleText || slide.title;

      item.append(indexEl, titleEl);
      item.addEventListener('click', () => {
        this.goTo(index);
        this.setOverview(false);
      });

      return item;
    });

    overviewItems.forEach((item) => overviewList.appendChild(item));
    overview.appendChild(overviewList);

    const controls = document.createElement('div');
    controls.className = 'deck__controls';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.textContent = '戻る';
    prevButton.addEventListener('click', () => this.previous());

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.textContent = '進む';
    nextButton.classList.add('primary');
    nextButton.addEventListener('click', () => this.next());

    controls.append(prevButton, nextButton);

    deck.append(header, stage, overview, controls);

    this.root.innerHTML = '';
    this.root.appendChild(deck);

    this.elements = {
      deck,
      header,
      stage,
      slides: slideElements,
      overview,
      overviewItems,
      overviewButton,
      controls,
      prevButton,
      nextButton,
      progressText,
      progressFill,
    };

    document.title = `${title}｜HTMLプレゼンビューア`;
    this.prepareSlideAnimations();
  }

  renderError(error) {
    this.root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'deck__error';
    container.innerHTML = `
      <p>スライドの読み込みに失敗しました。</p>
      <p>${escapeHtml(error.message || '未知のエラー')}</p>
    `;
    this.root.appendChild(container);
  }

  handleKeydown(event) {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ': {
        event.preventDefault();
        this.next();
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp': {
        event.preventDefault();
        this.previous();
        break;
      }
      case 'Home': {
        event.preventDefault();
        this.goTo(0);
        break;
      }
      case 'End': {
        event.preventDefault();
        this.goTo(this.state.slides.length - 1);
        break;
      }
      case 'o':
      case 'O': {
        event.preventDefault();
        this.toggleOverview();
        break;
      }
      case 'Escape': {
        if (this.state.overviewOpen) {
          event.preventDefault();
          this.setOverview(false);
        }
        break;
      }
      default:
        break;
    }
  }

  handleHashChange() {
    if (this.state.syncingHash) return;
    const index = this.getIndexFromHash();
    if (Number.isFinite(index)) {
      this.goTo(index, { skipHash: true });
    }
  }

  toggleOverview() {
    this.setOverview(!this.state.overviewOpen);
  }

  setOverview(open) {
    this.state.overviewOpen = open;
    if (!this.elements.overview || !this.elements.overviewButton) return;
    this.elements.overview.classList.toggle('is-open', open);
    this.elements.overview.setAttribute('aria-hidden', open ? 'false' : 'true');
    this.elements.overviewButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.elements.overviewButton.textContent = open ? '一覧を閉じる' : '一覧表示';
    if (open) {
      const activeItem = this.elements.overview.querySelector('.deck__overview-item.is-active');
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  next() {
    this.goTo(this.state.current + 1);
  }

  previous() {
    this.goTo(this.state.current - 1);
  }

  goTo(index, options = {}) {
    const { slides } = this.state;
    if (!slides.length) return;
    const clampedIndex = Math.max(0, Math.min(index, slides.length - 1));
    this.state.current = clampedIndex;
    this.updateView();
    if (!options.skipHash) {
      this.state.syncingHash = true;
      const hash = `#slide-${clampedIndex + 1}`;
      history.replaceState(null, '', hash);
      setTimeout(() => {
        this.state.syncingHash = false;
      }, 0);
    }
  }

  updateView() {
    const { slides } = this.state;
    if (!slides.length) return;
    const {
      slides: slideElements,
      prevButton,
      nextButton,
      progressText,
      progressFill,
      overviewItems,
    } = this.elements;
    const activeIndex = this.state.current;

    slideElements.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      slide.tabIndex = isActive ? 0 : -1;
      if (isActive) {
        slide.focus({ preventScroll: true });
        this.restartSlideAnimation(slide);
      } else {
        this.resetSlideAnimation(slide);
      }
    });

    if (prevButton) {
      prevButton.disabled = activeIndex === 0;
    }
    if (nextButton) {
      nextButton.disabled = activeIndex === slides.length - 1;
    }
    if (progressText) {
      progressText.textContent = `${activeIndex + 1} / ${slides.length}`;
    }
    if (progressFill) {
      const ratio = (activeIndex + 1) / slides.length;
      progressFill.style.width = `${ratio * 100}%`;
      const glowStrength = Math.min(0.35 + ratio * 0.35, 0.7);
      progressFill.style.boxShadow = `0 0 20px rgba(59, 130, 246, ${glowStrength})`;
    }

    if (this.elements.stage) {
      const ratioValue = (activeIndex + 1) / slides.length;
      this.elements.stage.style.setProperty('--progress-ratio', ratioValue.toFixed(4));
    }

    if (overviewItems) {
      overviewItems.forEach((item, index) => {
        item.classList.toggle('is-active', index === activeIndex);
      });
    }

    const activeSlide = slides[activeIndex];
    if (activeSlide) {
      const [, titleText] = splitSlideHeading(activeSlide.title);
      document.title = `${titleText || activeSlide.title}｜${this.state.title}`;
    }
  }

  getIndexFromHash() {
    const match = window.location.hash.match(/slide-(\d+)/i);
    if (!match) return undefined;
    const index = Number.parseInt(match[1], 10) - 1;
    if (Number.isNaN(index)) return undefined;
    return Math.max(0, Math.min(index, this.state.slides.length - 1));
  }

  prepareSlideAnimations() {
    if (!this.elements || !Array.isArray(this.elements.slides)) {
      return;
    }
    this.elements.slides.forEach((slide) => {
      const fragments = this.getSlideFragments(slide);
      fragments.forEach((element, index) => {
        const delay = Math.min(index * 70, 1400);
        element.style.setProperty('--stagger', `${delay}ms`);
      });
    });
  }

  restartSlideAnimation(slide) {
    if (!slide) return;
    const scheduled = this.animationFrameHandles.get(slide);
    if (scheduled) {
      cancelAnimationFrame(scheduled);
    }
    slide.classList.remove('is-animated');
    void slide.offsetWidth;
    const frameId = requestAnimationFrame(() => {
      slide.classList.add('is-animated');
      this.animationFrameHandles.delete(slide);
    });
    this.animationFrameHandles.set(slide, frameId);
  }

  resetSlideAnimation(slide) {
    if (!slide) return;
    const scheduled = this.animationFrameHandles.get(slide);
    if (scheduled) {
      cancelAnimationFrame(scheduled);
      this.animationFrameHandles.delete(slide);
    }
    slide.classList.remove('is-animated');
  }

  getSlideFragments(slide) {
    if (!slide) return [];
    const content = slide.querySelector('.slide__content');
    if (!content) return [];
    const fragments = [];
    Array.from(content.children).forEach((child) => {
      if (child.matches('ul, ol')) {
        fragments.push(child);
        const items = Array.from(child.children).filter((el) => el.tagName === 'LI');
        fragments.push(...items);
      } else {
        fragments.push(child);
      }
    });
    return fragments;
  }
}

async function fetchMarkdown(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Markdownの読み込みに失敗しました（HTTP ${response.status}）`);
  }
  return response.text();
}

function parseMarkdownSlides(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let deckTitle = 'プレゼンテーション';
  const slides = [];
  let currentTitle = null;
  let buffer = [];

  const pushSlide = () => {
    if (!currentTitle) return;
    const html = convertMarkdown(buffer);
    slides.push({ title: currentTitle, html });
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith('# ')) {
      deckTitle = line.replace(/^#\s+/, '').trim() || deckTitle;
      continue;
    }
    if (/^---\s*$/.test(line)) {
      break;
    }
    if (line.startsWith('## ')) {
      pushSlide();
      currentTitle = line.replace(/^##\s+/, '').trim();
      continue;
    }
    if (currentTitle) {
      buffer.push(line);
    }
  }
  pushSlide();

  return { title: deckTitle, slides };
}

function convertMarkdown(lines) {
  const htmlParts = [];
  const listStack = [];

  const closeAllLists = () => {
    while (listStack.length > 0) {
      htmlParts.push(`</${listStack.pop()}>`);
    }
  };

  const ensureList = (level, type) => {
    const targetDepth = level + 1;
    while (listStack.length > targetDepth) {
      htmlParts.push(`</${listStack.pop()}>`);
    }
    while (listStack.length < targetDepth) {
      htmlParts.push(`<${type}>`);
      listStack.push(type);
    }
    const currentType = listStack[listStack.length - 1];
    if (currentType !== type) {
      htmlParts.push(`</${listStack.pop()}>`);
      htmlParts.push(`<${type}>`);
      listStack.push(type);
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const leadingSpaces = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    const bulletMatch = /^[-*+]\s+/.test(trimmed);
    const orderedMatch = /^(\d+)\.\s+/.test(trimmed);

    if (bulletMatch || orderedMatch) {
      const level = Math.floor(leadingSpaces / 2);
      const type = orderedMatch ? 'ol' : 'ul';
      ensureList(level, type);
      const content = trimmed.replace(bulletMatch ? /^[-*+]\s+/ : /^(\d+)\.\s+/, '');
      htmlParts.push(`<li>${inlineMarkdown(content)}</li>`);
      continue;
    }

    // Not a list item – close lists before rendering paragraph
    closeAllLists();
    htmlParts.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeAllLists();
  return htmlParts.join('');
}

function inlineMarkdown(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function escapeHtml(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function splitSlideHeading(rawTitle) {
  if (!rawTitle) {
    return ['', ''];
  }
  const parts = rawTitle.split('｜');
  if (parts.length >= 2) {
    const [label, ...rest] = parts;
    return [label.trim(), rest.join('｜').trim()];
  }
  return [rawTitle.trim(), ''];
}

async function loadDeckMarkdown(source) {
  const normalized = source || {};
  const inlineMarkdown = getInlineMarkdownFromSource(normalized);
  const hasInline = typeof inlineMarkdown === 'string' && inlineMarkdown.length > 0;

  if (normalized.path) {
    if (window.location.protocol === 'file:' && hasInline) {
      console.info('ローカルファイルとして開いているため、埋め込みMarkdownを使用します。');
      return inlineMarkdown;
    }
    if (window.location.protocol !== 'file:') {
      try {
        return await fetchMarkdown(normalized.path);
      } catch (error) {
        if (hasInline) {
          console.warn('Markdownの取得に失敗したため、埋め込みデータを利用します。', error);
          return inlineMarkdown;
        }
        throw error;
      }
    }
    return fetchMarkdown(normalized.path);
  }

  if (hasInline) {
    return inlineMarkdown;
  }

  throw new Error('Markdownソースが見つかりませんでした。');
}

function normalizeMarkdownSource(source) {
  if (source === undefined || source === null) {
    return {};
  }
  if (typeof source === 'string') {
    return { path: source };
  }

  const normalized = {};
  if (typeof source.sourcePath === 'string') {
    normalized.path = source.sourcePath;
  } else if (typeof source.path === 'string') {
    normalized.path = source.path;
  }

  if (typeof source.inlineMarkdown === 'string') {
    normalized.inlineText = source.inlineMarkdown;
  } else if (typeof source.inlineText === 'string') {
    normalized.inlineText = source.inlineText;
  }

  const hasElementConstructor = typeof Element !== 'undefined';
  if (hasElementConstructor && source.inlineElement instanceof Element) {
    normalized.inlineElement = source.inlineElement;
  } else if (!hasElementConstructor && source.inlineElement) {
    normalized.inlineElement = source.inlineElement;
  }

  if (typeof source.inlineSelector === 'string') {
    normalized.inlineSelector = source.inlineSelector;
  }

  return normalized;
}

function getInlineMarkdownFromSource(source) {
  if (!source) {
    return '';
  }

  if (typeof source.inlineCache === 'string') {
    return source.inlineCache;
  }

  if (typeof source.inlineText === 'string' && source.inlineText.trim().length > 0) {
    source.inlineCache = source.inlineText.trim();
    return source.inlineCache;
  }

  let element = source.inlineElement;
  if (!element && typeof source.inlineSelector === 'string' && typeof document !== 'undefined') {
    element = document.querySelector(source.inlineSelector);
  }

  if (element && typeof element.textContent === 'string') {
    source.inlineCache = element.textContent.trim();
    return source.inlineCache;
  }

  return '';
}

window.addEventListener('DOMContentLoaded', () => {
  const inlineElement = document.getElementById('deck-inline-markdown');
  new SlideDeckApp('#app', {
    sourcePath: 'slides/story_presentation.md',
    inlineElement,
  });

});
