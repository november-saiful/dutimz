export function syncTopbarState(topbar, scrollY) {
  topbar.classList.toggle('is-stuck', scrollY > 0);
}
