// Category filter for the extension cards. Without JavaScript the filter bar
// stays hidden and every card is shown.
(() => {
  const bar = document.querySelector('[data-filters]');
  if (!bar) {
    return;
  }
  const buttons = Array.from(bar.querySelectorAll('[data-filter]'));
  const cards = Array.from(document.querySelectorAll('.card[data-category]'));
  const status = document.querySelector('[data-filter-status]');

  const apply = (filter, updateUrl) => {
    let shown = 0;
    for (const card of cards) {
      const match = filter === 'all' || card.dataset.category === filter;
      card.hidden = !match;
      if (match) {
        shown += 1;
      }
    }
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    }
    if (status) {
      status.textContent = (shown === 1 ? status.dataset.one : status.dataset.many).replace('{n}', String(shown));
    }
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (filter === 'all') {
        url.searchParams.delete('category');
      } else {
        url.searchParams.set('category', filter);
      }
      window.history.replaceState(null, '', url);
    }
  };

  bar.hidden = false;
  bar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) {
      apply(button.dataset.filter, true);
    }
  });

  const initial = new URLSearchParams(window.location.search).get('category');
  if (initial && buttons.some((button) => button.dataset.filter === initial)) {
    apply(initial, false);
  }
})();
