'use strict';

/* --------------------------------------------------------------------------
   CHECKOUT LINK
   When sales open, paste the official Posh or Bounce event URL here.
   Every [data-checkout] button becomes a live link that opens the checkout.
   Leave it empty while sales are closed.
   -------------------------------------------------------------------------- */
const CHECKOUT_URL = '';

/* ---------- Mobile navigation ---------- */
const header = document.querySelector('.header');
const menuButton = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('#mobile-menu');

function setMenu(open) {
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  mobileMenu.hidden = !open;
  header.classList.toggle('menu-open', open);
}
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
mobileMenu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mobileMenu.hidden) { setMenu(false); menuButton.focus(); }
});
window.matchMedia('(min-width: 721px)').addEventListener('change', event => { if (event.matches) setMenu(false); });

/* ---------- Header becomes solid after leaving the top of the hero ---------- */
const solidHeader = () => header.classList.toggle('is-solid', window.scrollY > 40);
solidHeader();
window.addEventListener('scroll', solidHeader, { passive: true });

/* ---------- Checkout buttons ---------- */
if (CHECKOUT_URL) {
  document.querySelectorAll('[data-checkout]').forEach(link => {
    link.href = CHECKOUT_URL;
    link.removeAttribute('aria-disabled');
    link.removeAttribute('role');
    link.textContent = 'Get tickets';
  });
}

/* ---------- Background film ----------
   - A 91-second highlight reel with the film's soundtrack, looping.
   - Starts muted (browsers block autoplay with sound). The header SOUND button unmutes it.
   - Picks the best file the screen can show (see pickSources). If playback stalls,
     it drops to the next, lighter file at the same timestamp.
   - Reduced-motion and data-saver visitors keep a still image, and the video never loads.
   - While muted, it plays only when a transparent "window" section is on screen.
     With sound on, it keeps playing as you scroll, so the music doesn't cut out.   */
const MEDIA = {
  uhdAv1: 'media/odyssey-reel-4k-av1.mp4',      // 3840x2160 AV1: smallest 4K file
  uhdHevc: 'media/odyssey-reel-4k-hevc.mp4',     // 3840x2160 HEVC: Safari, iPhone/Mac, Chrome/Edge with hardware support
  hd: 'media/odyssey-reel-1080.mp4',            // 1920x1080 H.264
  portraitHq: 'media/odyssey-reel-portrait-hq.mp4', // 1296x2160, full source resolution
  portrait: 'media/odyssey-reel-portrait.mp4',      // 648x1080
};
const AV1_TYPE = 'video/mp4; codecs="av01.0.12M.08"';
const HEVC_TYPE = 'video/mp4; codecs="hvc1.1.6.L150.90"';

// Best first, lighter fallbacks after.
async function pickSources() {
  if (window.matchMedia('(orientation: portrait) and (max-width: 1024px)').matches) {
    return [MEDIA.portraitHq, MEDIA.portrait];
  }
  // 4K only helps on screens with more than about 2200 physical pixels across (Retina laptops, 1440p+ monitors).
  const physicalWidth = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  if (physicalWidth < 2200) return [MEDIA.hd];
  // 4K: AV1 if this device decodes it smoothly, otherwise HEVC, otherwise 1080p. Either 4K file falls back to 1080p.
  const smooth = async contentType => {
    try {
      const info = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: { contentType, width: 3840, height: 2160, bitrate: 5000000, framerate: 24 },
      });
      return info.supported && info.smooth;
    } catch {
      return false;
    }
  };
  if (await smooth(AV1_TYPE)) return [MEDIA.uhdAv1, MEDIA.hd];
  if (await smooth(HEVC_TYPE) || document.createElement('video').canPlayType(HEVC_TYPE) === 'probably') return [MEDIA.uhdHevc, MEDIA.hd];
  return [MEDIA.hd];
}

const video = document.querySelector('.film-video');
const filmToggle = document.querySelector('.film-toggle');
const filmLabel = filmToggle.querySelector('.film-toggle-label');
const soundToggle = document.querySelector('.sound-toggle');
const soundLabel = soundToggle.querySelector('.sound-label');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection && navigator.connection.saveData;

let userPaused = false;
let soundOn = false;
let windowVisible = true;
let fadeTimer;

function render() {
  filmToggle.setAttribute('aria-pressed', String(userPaused));
  filmLabel.textContent = userPaused ? 'PLAY FILM' : 'PAUSE FILM';
  soundToggle.setAttribute('aria-pressed', String(soundOn));
  soundToggle.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  soundLabel.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
}

function sync() {
  const shouldPlay = !userPaused && !document.hidden && (windowVisible || soundOn);
  if (!shouldPlay) { video.pause(); return; }
  const attempt = video.play();
  if (attempt) attempt.catch(() => {
    // Playback refused (for example, autoplay blocked). Fall back to muted, then the still image.
    if (soundOn) { soundOn = false; video.muted = true; render(); }
  });
}

// Fade the volume rather than switching it abruptly.
// Tracks its own level because iOS Safari ignores video.volume (there the fade is skipped and only the mute applies).
let level = 0;
function fadeVolume(target, done) {
  clearInterval(fadeTimer);
  const step = target > level ? 0.05 : -0.08;
  fadeTimer = setInterval(() => {
    level = Math.min(1, Math.max(0, level + step));
    video.volume = level;
    if ((step > 0 && level >= target) || (step < 0 && level <= target)) {
      clearInterval(fadeTimer);
      if (done) done();
    }
  }, 40);
}

let sources = [];
let current = 0;
let stallTimer;
let hasPlayed = false;
let stallStart = 0;
let stalledTotal = 0;

function load(index, keepTime) {
  const time = keepTime ? video.currentTime : 0;
  current = index;
  hasPlayed = false;
  stallStart = 0;
  stalledTotal = 0;
  video.src = sources[index];
  if (time) video.addEventListener('loadedmetadata', () => { video.currentTime = time; }, { once: true });
  sync();
}

function downgrade() {
  clearTimeout(stallTimer);
  if (current < sources.length - 1) load(current + 1, true);
}

async function startFilm() {
  sources = await pickSources();
  video.poster = video.dataset.posterPlaying;
  video.muted = true;
  filmToggle.hidden = false;
  soundToggle.hidden = false;
  render();

  // Stall guard: switch to a lighter file if the first frame takes over 4s, any one stall
  // lasts over 2.5s, or short stutters add up to more than 3s.
  video.addEventListener('waiting', () => {
    clearTimeout(stallTimer);
    stallStart = performance.now();
    stallTimer = setTimeout(downgrade, hasPlayed ? 2500 : 4000);
  });
  video.addEventListener('playing', () => {
    clearTimeout(stallTimer);
    if (hasPlayed && stallStart) stalledTotal += performance.now() - stallStart;
    stallStart = 0;
    hasPlayed = true;
    if (stalledTotal > 3000) downgrade();
  });
  video.addEventListener('pause', () => { clearTimeout(stallTimer); stallStart = 0; });
  video.addEventListener('error', downgrade);

  load(0, false);
}

if (video && !reduceMotion && !saveData) {
  startFilm();

  filmToggle.addEventListener('click', () => { userPaused = !userPaused; render(); sync(); });

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn) {
      userPaused = false;          // turning sound on implies "play"
      level = 0;
      video.volume = 0;
      video.muted = false;
      sync();
      fadeVolume(1);
    } else {
      fadeVolume(0, () => { video.muted = true; sync(); });
    }
    render();
  });

  document.addEventListener('visibilitychange', sync);

  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    windowVisible = visible.size > 0;
    sync();
  }, { rootMargin: '10% 0px' });
  document.querySelectorAll('.window').forEach(section => observer.observe(section));
  sync();
}
