/* One continuous local MP4, sharing its composition with the persistent first-frame poster. */
(() => {
  'use strict';
  window.createWingkoHeroFilm = (stage, motionQuery, redraw) => {
    const settings = window.WINGKO_CONFIG?.heroFilm;
    if (!settings?.src) return null;
    const layer = document.createElement('div');
    layer.className = 'hero-film';
    layer.setAttribute('aria-hidden', 'true');
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.disablePictureInPicture = true;
    if (settings.poster) video.poster = settings.poster;
    layer.append(video);
    stage.querySelector('.hero-visual').append(layer);
    stage.closest('.hero').classList.add('has-hero-film');
    let requested = false, ready = false, presented = false, failed = false;
    let progress = 0, desiredTime = 0, seekPending = false;
    const clamp = v => Math.max(0, Math.min(1, v));

    function seekLatest() {
      if (!ready || failed || motionQuery.matches || document.hidden || video.seeking || seekPending) return;
      if (Math.abs(video.currentTime - desiredTime) < 1 / 30) return;
      try {
        seekPending = true;
        video.currentTime = desiredTime;
      } catch {
        seekPending = false;
        fail();
      }
    }
    function fail() {
      failed = true;
      ready = false;
      layer.style.opacity = '0';
      video.pause();
      redraw();
    }
    function sync(p) {
      progress = p;
      const active = !motionQuery.matches && !failed;
      if (active && !requested && !document.hidden) {
        requested = true;
        video.src = settings.src;
        video.load();
      }
      layer.style.opacity = active && presented ? '1' : '0';
      if (active && ready) {
        // The same shot spans the full introduction; the first and last poses hold for the text.
        desiredTime = clamp((p - .12) / (.88 - .12)) * Math.max(0, video.duration - 1 / 30);
        seekLatest();
      }
      return active && presented;
    }
    video.addEventListener('loadeddata', () => {
      if (failed || !Number.isFinite(video.duration) || video.duration <= 0) return;
      ready = true;
      sync(progress);
      if (!seekPending) presented = true;
      redraw();
    });
    // Coalesce scroll events during decoding. Only the newest target is sought next.
    video.addEventListener('seeked', () => {
      seekPending = false;
      // A late load must reach the current scroll position before replacing the poster.
      if (!presented && Math.abs(video.currentTime - desiredTime) < 1 / 30) {
        presented = true;
        redraw();
      }
      seekLatest();
    });
    video.addEventListener('error', fail);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { sync(progress); redraw(); }
    });
    motionQuery.addEventListener('change', () => {
      video.pause();
      sync(progress);
      redraw();
    });
    return { sync };
  };
})();
