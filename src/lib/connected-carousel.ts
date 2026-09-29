export type CarouselItem = {
  stat: string;
  href: string;
  imageUrl?: string;
  imageClass: string;
  alt?: string;
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character] ?? character);

function artMarkup() {
  return `<span class="story-art__halo"></span><span class="story-art__line story-art__line--one"></span><span class="story-art__line story-art__line--two"></span><span class="story-art__seal">ঢা<br><i>বি</i></span>`;
}

function slideMarkup(item: CarouselItem, index: number, active: boolean) {
  // Only the first (visible) thumbnail is eager and high-priority so it paints
  // fast; every offscreen slide lazy-loads instead of competing for bandwidth.
  const image = item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.alt ?? item.stat)}" loading="${index === 0 ? 'eager' : 'lazy'}"${index === 0 ? ' fetchpriority="high"' : ''} decoding="async">`
    : artMarkup();
  const heading = active
    ? `<h1 id="featured-title" data-carousel-title class="connected-carousel__caption">${escapeHtml(item.stat)}</h1>`
    : `<h2 class="connected-carousel__caption">${escapeHtml(item.stat)}</h2>`;
  const imageClass = item.imageUrl ? ' has-image' : '';
  return `<article class="connected-carousel__slide${active ? ' connected-carousel__active is-active' : ''}" data-carousel-item data-index="${index}" data-stat="${escapeHtml(item.stat)}" data-href="${escapeHtml(item.href)}"${active ? ' data-carousel-active data-active-index="0"' : ''} id="${active ? 'connected-carousel-active' : `connected-carousel-slide-${index}`}" role="tabpanel" aria-labelledby="connected-carousel-tab-${index}" aria-hidden="${!active}"${active ? '' : ' inert'}><a class="connected-carousel__image story-art__visual${imageClass} ${escapeHtml(item.imageClass)}" data-carousel-link href="${escapeHtml(item.href)}" aria-label="প্রতিবেদন পড়ুন: ${escapeHtml(item.stat)}">${image}${heading}</a></article>`;
}

export function renderConnectedCarousel(items: CarouselItem[], label = 'সাম্প্রতিক প্রতিবেদন', interval = 6000) {
  if (!items.length) return '';
  const slides = items.map((item, index) => slideMarkup(item, index, index === 0)).join('');
  const tabs = items.map((item, index) => `<button class="connected-carousel__tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" data-carousel-tab data-index="${index}" id="connected-carousel-tab-${index}" aria-label="প্রতিবেদন ${index + 1}: ${escapeHtml(item.stat)}" aria-selected="${index === 0}" aria-controls="connected-carousel-active" tabindex="${index === 0 ? '0' : '-1'}"><span data-carousel-progress></span></button>`).join('');
  return `<section class="connected-carousel-band" aria-label="${escapeHtml(label)}"><div class="connected-carousel" data-connected-carousel data-carousel-interval="${Math.max(1500, Math.min(interval, 30000))}" data-carousel-pause-on-hover="false" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(label)}" aria-keyshortcuts="ArrowLeft ArrowRight" tabindex="0"><div class="connected-carousel__viewport" data-carousel-viewport><div class="connected-carousel__track" data-carousel-track>${slides}</div></div><div class="connected-carousel__controls"><button class="connected-carousel__arrow" type="button" data-carousel-previous aria-label="আগের প্রতিবেদন"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7"/></svg></button><div class="connected-carousel__tabs" role="tablist" aria-label="প্রতিবেদন বেছে নিন">${tabs}</div><button class="connected-carousel__arrow" type="button" data-carousel-next aria-label="পরের প্রতিবেদন"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-7-7 7 7-7 7"/></svg></button></div></div></section>`;
}
