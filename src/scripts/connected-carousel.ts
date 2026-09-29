type CarouselState = {
  active: number;
  position: number;
  frame: number;
  startedAt: number | null;
  elapsed: number;
  hovered: boolean;
  focused: boolean;
};

function wrap(index: number, total: number) {
  return ((index % total) + total) % total;
}

export function initConnectedCarousel(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-connected-carousel]').forEach((carousel) => {
    if (carousel.dataset.carouselReady === 'true') return;
    const items = Array.from(carousel.querySelectorAll<HTMLElement>('[data-carousel-item]'));
    const tabs = Array.from(carousel.querySelectorAll<HTMLButtonElement>('[data-carousel-tab]'));
    const viewport = carousel.querySelector<HTMLElement>('[data-carousel-viewport]');
    const track = carousel.querySelector<HTMLElement>('[data-carousel-track]');
    const previous = carousel.querySelector<HTMLButtonElement>('[data-carousel-previous]');
    const next = carousel.querySelector<HTMLButtonElement>('[data-carousel-next]');
    const total = items.length;
    if (!total || !viewport || !track) return;
    carousel.dataset.carouselReady = 'true';

    const interval = Math.max(1500, Number(carousel.dataset.carouselInterval) || 6000);
    const pauseOnHover = carousel.dataset.carouselPauseOnHover === 'true';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state: CarouselState = { active: 0, position: total > 1 ? 1 : 0, frame: 0, startedAt: null, elapsed: 0, hovered: false, focused: false };

    // Edge clones let next/previous slide continuously across the first/last boundary.
    if (total > 1) {
      const firstClone = items[0].cloneNode(true) as HTMLElement;
      const lastClone = items[total - 1].cloneNode(true) as HTMLElement;
      for (const clone of [firstClone, lastClone]) {
        clone.removeAttribute('id');
        clone.removeAttribute('data-carousel-item');
        clone.removeAttribute('data-carousel-active');
        clone.removeAttribute('data-active-index');
        clone.classList.remove('connected-carousel__active', 'is-active');
        clone.querySelectorAll('[data-carousel-link]').forEach((element) => element.removeAttribute('data-carousel-link'));
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        // Clones mirror the first/last slide for the wrap-around animation; they
        // must never pre-empt the real first thumbnail in the load queue.
        clone.querySelectorAll('img').forEach((image) => {
          image.loading = 'lazy';
          image.removeAttribute('fetchpriority');
        });
        clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        clone.querySelectorAll('[data-carousel-title]').forEach((element) => element.removeAttribute('data-carousel-title'));
        clone.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((element) => element.setAttribute('tabindex', '-1'));
      }
      track.insertBefore(lastClone, track.firstChild);
      track.appendChild(firstClone);
    }

    const setProgress = (percent: number) => tabs.forEach((tab) => {
      const bar = tab.querySelector<HTMLElement>('[data-carousel-progress]');
      if (bar) bar.style.transform = `scaleX(${tab.dataset.index === String(state.active) ? percent / 100 : 0})`;
    });

    const setPosition = (animate = true) => {
      if (!animate || reducedMotion.matches) {
        track.classList.add('is-jumping');
        track.style.transform = `translate3d(${-state.position * viewport.clientWidth}px, 0, 0)`;
        void track.offsetWidth;
        track.classList.remove('is-jumping');
        return;
      }
      track.style.transform = `translate3d(${-state.position * viewport.clientWidth}px, 0, 0)`;
    };

    const render = (animate = true) => {
      items.forEach((item, index) => {
        const active = index === state.active;
        item.classList.toggle('is-active', active);
        item.classList.toggle('connected-carousel__active', active);
        item.toggleAttribute('data-carousel-active', active);
        item.id = active ? 'connected-carousel-active' : `connected-carousel-slide-${index}`;
        item.dataset.activeIndex = active ? String(index) : '';
        if (!active) delete item.dataset.activeIndex;
        item.setAttribute('aria-hidden', String(!active));
        if (active) item.removeAttribute('inert');
        else item.setAttribute('inert', '');
        item.setAttribute('aria-labelledby', `connected-carousel-tab-${index}`);
        const existingHeading = item.querySelector<HTMLElement>('h1, h2');
        if (existingHeading) {
          const heading = document.createElement(active ? 'h1' : 'h2');
          heading.className = 'connected-carousel__caption';
          heading.textContent = item.dataset.stat ?? '';
          if (active) {
            heading.id = 'featured-title';
            heading.dataset.carouselTitle = '';
          }
          existingHeading.replaceWith(heading);
        }
        const link = item.querySelector<HTMLAnchorElement>('.connected-carousel__image');
        if (link) {
          if (active) link.dataset.carouselLink = '';
          else delete link.dataset.carouselLink;
        }
      });
      tabs.forEach((tab, index) => {
        const selected = index === state.active;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle('is-active', selected);
      });
      setProgress((state.elapsed / interval) * 100);
      carousel.classList.toggle('is-single', total < 2);
      if (previous) previous.disabled = total < 2;
      if (next) next.disabled = total < 2;
      setPosition(animate);
    };

    track.addEventListener('transitionend', (event) => {
      if (event.target !== track || event.propertyName !== 'transform') return;
      if (state.position === 0) {
        state.position = total;
        setPosition(false);
      } else if (state.position === total + 1) {
        state.position = 1;
        setPosition(false);
      }
    });

    const stopClock = () => {
      window.cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.startedAt = null;
    };
    const shouldPause = () => reducedMotion.matches || (pauseOnHover && state.hovered) || state.focused || document.hidden;
    const tick = (now: number) => {
      if (state.startedAt === null) state.startedAt = now;
      state.elapsed += Math.max(0, now - state.startedAt);
      state.startedAt = now;
      setProgress(Math.min(100, (state.elapsed / interval) * 100));
      if (state.elapsed >= interval) {
        state.elapsed = 0;
        state.startedAt = null;
        const nextIndex = wrap(state.active + 1, total);
        state.position = state.active === total - 1 ? total + 1 : nextIndex + 1;
        state.active = nextIndex;
        render();
      }
      state.frame = window.requestAnimationFrame(tick);
    };
    const startClock = () => {
      stopClock();
      if (!shouldPause() && total > 1) state.frame = window.requestAnimationFrame(tick);
    };
    const select = (requested: number) => {
      if (total < 2) return;
      const target = wrap(requested, total);
      if (requested > state.active && target === 0) state.position = total + 1;
      else if (requested < state.active && target === total - 1) state.position = 0;
      else state.position = target + 1;
      state.active = target;
      state.elapsed = 0;
      render();
      startClock();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? total - 1 : wrap(index + (event.key === 'ArrowRight' ? 1 : -1), total);
        select(target);
        tabs[target]?.focus();
      });
    });
    previous?.addEventListener('click', () => select(state.active - 1));
    next?.addEventListener('click', () => select(state.active + 1));
    carousel.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('[role="tab"]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(state.active - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); select(state.active + 1); }
    });
    carousel.addEventListener('mouseenter', () => { state.hovered = true; if (pauseOnHover) stopClock(); });
    carousel.addEventListener('mouseleave', () => { state.hovered = false; startClock(); });
    carousel.addEventListener('focusin', () => { state.focused = true; stopClock(); });
    carousel.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && carousel.contains(event.relatedTarget)) return;
      state.focused = false;
      startClock();
    });
    reducedMotion.addEventListener('change', () => { setPosition(false); startClock(); });
    document.addEventListener('visibilitychange', startClock);
    window.addEventListener('resize', () => setPosition(false), { passive: true });
    let touchStartX: number | null = null;
    viewport.addEventListener('touchstart', (event) => {
      touchStartX = event.touches[0]?.clientX ?? null;
    }, { passive: true });
    viewport.addEventListener('touchend', (event) => {
      if (touchStartX === null) return;
      const distance = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) >= 45) select(state.active + (distance < 0 ? 1 : -1));
    }, { passive: true });
    render(false);
    startClock();
  });
}
