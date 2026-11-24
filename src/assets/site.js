// Category filter and card animations. Without JavaScript the filter bar
// stays hidden, every card is shown and animations show their still image.
(() => {
  const cards = Array.from(document.querySelectorAll('.card[data-category]'));

  // Category filter.
  const bar = document.querySelector('[data-filters]');
  if (bar) {
    const buttons = Array.from(bar.querySelectorAll('[data-filter]'));
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
  }

  // Card animations: they play while the card is on screen, unless the
  // visitor asks for reduced motion or pauses them; a button plays or pauses
  // each one (WCAG 2.2.2).
  const videos = Array.from(document.querySelectorAll('[data-card-video]'));
  if (!videos.length) {
    return;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pausedByVisitor = new WeakSet();

  const sync = (video, button) => {
    const playing = !video.paused;
    button.dataset.state = playing ? 'playing' : 'paused';
    button.setAttribute('aria-label', playing ? button.dataset.labelPause : button.dataset.labelPlay);
  };

  const play = (video) => {
    const attempt = video.play();
    if (attempt && attempt.catch) {
      attempt.catch(() => {});
    }
  };

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting && !pausedByVisitor.has(video) && !reducedMotion) {
          play(video);
        } else if (!entry.isIntersecting && !video.paused) {
          video.pause();
        }
      }
    }, { threshold: 0.5 })
    : null;

  for (const video of videos) {
    const button = video.parentElement.querySelector('[data-media-toggle]');
    if (!button) {
      continue;
    }
    button.hidden = false;
    video.addEventListener('play', () => sync(video, button));
    video.addEventListener('pause', () => sync(video, button));
    button.addEventListener('click', () => {
      if (video.paused) {
        pausedByVisitor.delete(video);
        play(video);
      } else {
        pausedByVisitor.add(video);
        video.pause();
      }
    });
    sync(video, button);
    if (observer) {
      observer.observe(video);
    }
  }
})();
