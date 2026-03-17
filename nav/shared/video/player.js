// player.js – optimized for low memory, low latency, and smooth playback

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function() {
    'use strict';

    // Use a smaller RAF scheduler for all visual updates
    const rafScheduler = (() => {
      let tasks = new Set();
      let rafId = null;
      const run = () => {
        rafId = null;
        const currentTasks = tasks;
        tasks = new Set();
        currentTasks.forEach(fn => fn());
      };
      return (fn) => {
        tasks.add(fn);
        if (rafId === null) rafId = requestAnimationFrame(run);
      };
    })();

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPlayer);
    } else {
      initPlayer();
    }


    function initPlayer() {
      const video = document.querySelector('video');
      if (!video) return;

      // ---------- DOM references (will be nullified on destroy) ----------
      let elements = {
        video,
        container: document.querySelector('.video-container'),
        playPauseBtn: document.querySelector('.play-pause-btn'),
        theaterBtn: document.querySelector('.theater-btn'),
        fullScreenBtn: document.querySelector('.full-screen-btn'),
        miniPlayerBtn: document.querySelector('.mini-player-btn'),
        muteBtn: document.querySelector('.mute-btn'),
        captionsBtn: document.querySelector('.captions-btn'),
        speedBtn: document.querySelector('.speed-btn'),
        currentTime: document.querySelector('.current-time'),
        totalTime: document.querySelector('.total-time'),
        previewImg: document.querySelector('.preview-img'),
        thumbnailImg: document.querySelector('.thumbnail-img'),
        volumeSlider: document.querySelector('.volume-slider'),
        timelineContainer: document.querySelector('.timeline-container'),
        bufferBar: document.querySelector('.buffer-bar'),
        settingsBtn: document.querySelector('.settings-btn'),
        settingsContainer: document.querySelector('.settings-container'),
        qualityOptions: document.querySelectorAll('.quality-option')
      };

      // ---------- Mobile detection ----------
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      (navigator.maxTouchPoints > 1);

      // ---------- Cleanup on element removal (SPA support) ----------
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.removedNodes) {
            if (node.contains && node.contains(elements.container)) {
              destroyPlayer();
              return;
            }
          }
        }
      });
      observer.observe(elements.container.parentElement, { childList: true, subtree: false });

      function destroyPlayer() {
        observer.disconnect();
        // Destroy streaming engine
        if (streamPlayer) {
          if (streamType === 'hls') streamPlayer.destroy();
          else if (streamType === 'dash') streamPlayer.reset();
          streamPlayer = null;
        }
        // Clear all intervals and timeouts
        if (bufferUpdateRaf) cancelAnimationFrame(bufferUpdateRaf);
        if (rectUpdateRaf) cancelAnimationFrame(rectUpdateRaf);
        if (qualitySwitchTimeout) clearTimeout(qualitySwitchTimeout);
        if (controlsTimeout) clearTimeout(controlsTimeout);
        if (bufferingTimeout) clearTimeout(bufferingTimeout);
        if (settingsCloseTimeout) clearTimeout(settingsCloseTimeout);
        // Remove all event listeners (optional – elements will be GC'd)
        // Nullify references
        elements = null;
      }

      // ---------- Streaming Configuration (low latency tuned) ----------
      const STREAM_CONFIG = {
        preferredFormat: 'auto',
        hlsSource: '/assets/hls/intro/master.m3u8',
        dashSource: '/assets/dash/intro/manifest.mpd',
        dashEnabled: true,
        hlsEnabled: true,
        thumbnails: {
          enabled: true,
          vttSource: '/assets/dash/intro/thumbnails.vtt'
        }
      };

      let streamPlayer = null;
      let streamType = null;
      let currentQuality = 'auto';
      let isQualitySwitching = false;

      // ---------- Feature detection ----------
      const features = {
        pictureInPicture: !!(document.pictureInPictureEnabled && video.requestPictureInPicture),
        fullscreen: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
        captions: false,
        previewImages: STREAM_CONFIG.thumbnails.enabled,
        hls: typeof Hls !== 'undefined' && Hls.isSupported(),
        dash: typeof dashjs !== 'undefined' && dashjs.supportsMediaSource(),
        nativeHls: video.canPlayType('application/vnd.apple.mpegurl') !== ''
      };

      // ---------- VTT Thumbnail System (lazy loaded) ----------
      const thumbnailSystem = {
        mode: null,
        cues: [],
        spriteUrl: null,
        spriteLoaded: false,
        baseUrl: '',
        observer: null
      };

      async function parseVTT(vttUrl) {
        try {
          const response = await fetch(vttUrl);
          if (!response.ok) throw new Error('VTT fetch failed');
          const text = await response.text();
          const cues = [];
          const baseUrl = vttUrl.substring(0, vttUrl.lastIndexOf('/') + 1);
          thumbnailSystem.baseUrl = baseUrl;
          const blocks = text.trim().split(/\n\s*\n/);

          for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;

            const timestampLineIndex = lines.findIndex(l => l.includes(' --> '));
            if (timestampLineIndex === -1) continue;

            const timestampLine = lines[timestampLineIndex];
            const payload = lines.slice(timestampLineIndex + 1).join('\n').trim();
            if (!payload) continue;

            const timestampMatch = timestampLine.match(
              /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
            );
            if (!timestampMatch) continue;

            const start = parseTimestamp(timestampMatch.slice(1, 5));
            const end = parseTimestamp(timestampMatch.slice(5, 9));

            const xywh = payload.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
            if (xywh) {
              const imageUrl = payload.split('#')[0];
              cues.push({
                start, end,
                url: imageUrl.startsWith('http') ? imageUrl : baseUrl + imageUrl,
                x: parseInt(xywh[1], 10), y: parseInt(xywh[2], 10),
                w: parseInt(xywh[3], 10), h: parseInt(xywh[4], 10)
              });
              if (!thumbnailSystem.spriteUrl) thumbnailSystem.spriteUrl = cues[cues.length - 1].url;
            } else {
              cues.push({
                start, end,
                url: payload.startsWith('http') ? payload : baseUrl + payload,
                x: 0, y: 0, w: null, h: null
              });
            }
          }
          return cues;
        } catch (err) {
          console.warn('VTT parsing failed:', err);
          return null;
        }
      }

      function parseTimestamp(parts) {
        const [h, m, s, ms] = parts.map(Number);
        return h * 3600 + m * 60 + s + ms / 1000;
      }

      function findCueForTime(time) {
        if (!thumbnailSystem.cues.length) return null;
        let low = 0, high = thumbnailSystem.cues.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const cue = thumbnailSystem.cues[mid];
          if (time >= cue.start && time < cue.end) return cue;
          if (time < cue.start) high = mid - 1;
          else low = mid + 1;
        }
        return thumbnailSystem.cues[thumbnailSystem.cues.length - 1];
      }

      function applyThumbnail(element, time) {
        if (!element || !features.previewImages || thumbnailSystem.mode !== 'vtt') return;
        const cue = findCueForTime(time);
        if (!cue) return;

        if (cue.w && cue.h) {
          element.style.backgroundImage = `url('${cue.url}')`;
          element.style.backgroundPosition = `-${cue.x}px -${cue.y}px`;
          element.style.backgroundSize = 'auto';
          element.style.width = cue.w + 'px';
          element.style.height = cue.h + 'px';
          if (element.tagName === 'IMG') element.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        } else {
          if (element.tagName === 'IMG') {
            element.src = cue.url;
            element.style.backgroundImage = '';
          } else {
            element.style.backgroundImage = `url('${cue.url}')`;
            element.style.backgroundPosition = 'center';
            element.style.backgroundSize = 'contain';
          }
        }
      }

      function preloadSprite(url) {
        if (!url || thumbnailSystem.spriteLoaded) return;
        const img = new Image();
        img.onload = () => thumbnailSystem.spriteLoaded = true;
        img.src = url;
      }

      async function initThumbnails() {
        if (!STREAM_CONFIG.thumbnails.enabled) {
          features.previewImages = false;
          hideElement(elements.previewImg);
          hideElement(elements.thumbnailImg);
          return;
        }

        const vttUrl = STREAM_CONFIG.thumbnails.vttSource;
        if (vttUrl) {
          // Parse in idle time to avoid blocking initial render
          requestIdleCallback(async () => {
            const cues = await parseVTT(vttUrl);
            if (cues && cues.length > 0) {
              thumbnailSystem.cues = cues;
              thumbnailSystem.mode = 'vtt';
              features.previewImages = true;
              if (thumbnailSystem.spriteUrl) preloadSprite(thumbnailSystem.spriteUrl);
            } else {
              thumbnailSystem.mode = null;
              features.previewImages = false;
              hideElement(elements.previewImg);
              hideElement(elements.thumbnailImg);
            }
          }, { timeout: 2000 });
        } else {
          features.previewImages = false;
          hideElement(elements.previewImg);
          hideElement(elements.thumbnailImg);
        }
      }

      function hideElement(el) { if (el) el.style.display = 'none'; }

      // ---------- Stream Initialization (low latency settings) ----------
      async function initStream() {
        const format = STREAM_CONFIG.preferredFormat;

        // 1. Prioritize Native HLS for Apple devices above all else
        if (STREAM_CONFIG.hlsEnabled && features.nativeHls && isAppleDevice()) {
        const hlsAvailable = await checkFileExists(STREAM_CONFIG.hlsSource);
        if (hlsAvailable) {
          initNativeHLS();
          return;
        }
        }

        // 2. Fall back to DASH for non-Apple devices
        if (STREAM_CONFIG.dashEnabled && (format === 'dash' || format === 'auto') && features.dash && !isAppleDevice()) {
        const dashAvailable = await checkFileExists(STREAM_CONFIG.dashSource);
        if (dashAvailable) {
          initDASH();
          return;
        }
        }

        // 3. Fall back to HLS.js for browsers that don't support DASH or Native HLS
        if (STREAM_CONFIG.hlsEnabled && (format === 'hls' || format === 'auto') && features.hls) {
        const hlsAvailable = await checkFileExists(STREAM_CONFIG.hlsSource);
        if (hlsAvailable) {
          initHLS();
          return;
        }
        }

        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      async function checkFileExists(url) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          return response.ok;
        } catch {
          return false;
        }
      }

      function isAppleDevice() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.userAgentData?.platform === 'macOS' && navigator.maxTouchPoints > 1) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      }

      // ========== DASH (low latency) ==========
      // ========== DASH (Optimized for Mobile Performance) ==========
      function initDASH() {
        streamType = 'dash';
        streamPlayer = dashjs.MediaPlayer().create();
        streamPlayer.initialize(video, STREAM_CONFIG.dashSource, false);

        streamPlayer.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              // Increased buffer times to let mobile CPUs rest between downloads
              stableBufferTime: isMobile ? 12 : 20,        
              bufferTimeAtTopQuality: isMobile ? 15 : 30,
              bufferToKeep: isMobile ? 10 : 15,
              bufferPruningInterval: 2
            },
            abr: {
              autoSwitchBitrate: { video: true, audio: true },
              // Hard-cap DASH on mobile to ~4.5Mbps (effectively 720p)
              maxBitrate: { video: isMobile ? 4500 : -1 }
            },
            // Disable low latency for mobile to prevent CPU starvation
            lowLatencyEnabled: !isMobile,                     
          }
        });

        streamPlayer.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, throttledBufferUpdate);
        streamPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, startBufferMonitoring);

        streamPlayer.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, () => {
          if (isQualitySwitching) finishQualitySwitch();
          updateActiveQualityUI();
        });

        streamPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          console.error('DASH error:', e.error);
          if (e.error && e.error.code === dashjs.MediaPlayer.errors.MANIFEST_LOADER_PARSING_FAILURE) {
            fallbackToMP4();
          }
        });
      }

      // ========== HLS (low latency) ==========
      // ========== HLS (Optimized for Mobile Performance) ==========
      function initHLS() {
        streamType = 'hls';

        streamPlayer = new Hls({
          // Relaxed buffer constraints to allow efficient chunk processing
          maxBufferLength: isMobile ? 15 : 30, 
          maxMaxBufferLength: isMobile ? 30 : 60, 
          maxBufferSize: isMobile ? 30 * 1000000 : 60 * 1000000, // 30MB for mobile
          maxBufferHole: 0.3,
          startLevel: -1,
          autoStartLoad: true,
          startPosition: -1,
          highBufferWatchdogPeriod: 1,
          nudgeOffset: 0.05,
          nudgeMaxRetry: 3,
          abrEwmaDefaultEstimate: 500000,
          abrBandWidthFactor: 0.9,
          abrBandWidthUpFactor: 0.7,
          fragLoadingTimeOut: 10000,
          fragLoadingMaxRetry: 4,
          fragLoadingRetryDelay: 500,
          enableWorker: true,
          // Disable low latency on mobile to stop micro-stutters
          lowLatencyMode: !isMobile,
          // Disable automatic player sizing; we hard-cap it in MANIFEST_PARSED
          capLevelToPlayerSize: false,                           
          backBufferLength: isMobile ? 10 : 20,
          liveSyncDuration: 2,                             
          liveMaxLatencyDuration: 4
        });

        streamPlayer.loadSource(STREAM_CONFIG.hlsSource);
        streamPlayer.attachMedia(video);

        streamPlayer.on(Hls.Events.FRAG_BUFFERED, throttledBufferUpdate);

        streamPlayer.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (isQualitySwitching) finishQualitySwitch();
          updateActiveQualityUI();
        });

        streamPlayer.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                streamPlayer.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                streamPlayer.recoverMediaError();
                break;
              default:
                fallbackToMP4();
                break;
            }
          }
        });

        streamPlayer.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          startBufferMonitoring();
          
          // Hard-cap mobile to 720p (or the closest level under 800px height)
          if (isMobile) {
            const maxLevel = data.levels.findIndex(level => level.height > 800);
            streamPlayer.autoLevelCapping = maxLevel > 0 ? maxLevel - 1 : -1;
          }
        });
      }

      // Throttled buffer update using RAF
      let lastBufferUpdateTime = 0;
      let bufferUpdateRaf = null;

      function throttledBufferUpdate() {
        const now = performance.now();
        if (now - lastBufferUpdateTime < 500) return; // 500ms strict throttle

        if (bufferUpdateRaf === null) {
          bufferUpdateRaf = requestAnimationFrame(() => {
            bufferUpdateRaf = null;
            lastBufferUpdateTime = performance.now();
            updateBufferBar();
          });
        }
      }

      function initNativeHLS() {
        video.src = STREAM_CONFIG.hlsSource;
        streamType = 'native';
      }

      function fallbackToMP4() {
        if (streamPlayer) {
          if (streamType === 'hls') {
            streamPlayer.destroy();
          } else if (streamType === 'dash') {
            streamPlayer.reset();
          }
          streamPlayer = null;
        }
        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      // ---------- Quality Selection (seamless, shorter timeout) ----------
      let qualitySwitchTimeout = null;
      let savedPlaybackState = null;

      function finishQualitySwitch() {
        if (!isQualitySwitching) return;

        isQualitySwitching = false;
        if (qualitySwitchTimeout) {
          clearTimeout(qualitySwitchTimeout);
          qualitySwitchTimeout = null;
        }
        if (elements.container) {
          elements.container.classList.remove('buffering');
        }
        if (savedPlaybackState && !savedPlaybackState.wasPaused) {
          video.play().catch(() => {});
        }
        savedPlaybackState = null;
        updateActiveQualityUI();
      }

      async function selectQuality(quality) {
        if (currentQuality === quality) {
          closeSettingsMenu();
          return;
        }

        if (!streamPlayer && streamType !== 'mp4' && streamType !== 'native') {
          currentQuality = quality;
          closeSettingsMenu();
          return;
        }

        // Update UI immediately
        elements.qualityOptions.forEach(opt => {
          opt.classList.toggle('active', opt.dataset.quality === quality);
        });

        isQualitySwitching = true;
        if (elements.container) elements.container.classList.add('buffering');

        if (qualitySwitchTimeout) clearTimeout(qualitySwitchTimeout);
        // Shorter fallback timeout (2 seconds) for faster recovery
        qualitySwitchTimeout = setTimeout(finishQualitySwitch, 2000);

        savedPlaybackState = {
          time: video.currentTime,
          wasPaused: video.paused
        };

        try {
          if (streamType === 'dash') switchDashQuality(quality);
          else if (streamType === 'hls') switchHLSQuality(quality);
          else finishQualitySwitch();
        } catch (error) {
          console.error('Quality switch failed:', error);
          finishQualitySwitch();
        }

        currentQuality = quality;
        closeSettingsMenu();
      }

      function findClosestQuality(list, targetHeight, heightKey = 'height') {
        let bestIndex = -1, bestDiff = Infinity;
        for (let i = 0; i < list.length; i++) {
          const h = list[i][heightKey];
          if (!h) continue;
          if (h === targetHeight) return i;
          const diff = Math.abs(h - targetHeight);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i;
          }
        }
        return bestIndex;
      }

      function switchDashQuality(quality) {
        if (!streamPlayer) return;

        if (quality === 'auto') {
          streamPlayer.updateSettings({
            streaming: { abr: { autoSwitchBitrate: { video: true, audio: true } } }
          });
          finishQualitySwitch();
          return;
        }

        const bitrateInfos = streamPlayer.getBitrateInfoListFor('video');
        if (!bitrateInfos || bitrateInfos.length === 0) return;

        const targetIndex = findClosestQuality(bitrateInfos, parseInt(quality, 10));
        if (targetIndex === -1) return;

        streamPlayer.updateSettings({
          streaming: { abr: { autoSwitchBitrate: { video: false, audio: false } } }
        });
        streamPlayer.setQualityFor('video', targetIndex);

        // If no quality change event fires within 500ms, force finish
        setTimeout(() => {
          if (isQualitySwitching) finishQualitySwitch();
        }, 500);
      }

      function switchHLSQuality(quality) {
        if (!streamPlayer) return;

        if (quality === 'auto') {
          streamPlayer.currentLevel = -1;
          streamPlayer.loadLevel = -1;
          streamPlayer.nextLevel = -1;
          finishQualitySwitch();
          return;
        }

        const levels = streamPlayer.levels;
        if (!levels || levels.length === 0) return;

        const targetLevel = findClosestQuality(levels, parseInt(quality, 10));
        if (targetLevel === -1) return;

        streamPlayer.currentLevel = targetLevel;
        streamPlayer.loadLevel = targetLevel;
        streamPlayer.nextLevel = targetLevel;

        setTimeout(() => {
          if (isQualitySwitching) finishQualitySwitch();
        }, 500);
      }

      function updateActiveQualityUI() {
        if (streamType === 'hls' && streamPlayer && streamPlayer.levels) {
          const currentLevel = streamPlayer.currentLevel;
          if (currentLevel === -1) {
            elements.qualityOptions.forEach(opt => {
              opt.classList.toggle('active', opt.dataset.quality === 'auto');
            });
            return;
          }
          const level = streamPlayer.levels[currentLevel];
          if (level && level.height) {
            elements.qualityOptions.forEach(opt => {
              const q = opt.dataset.quality;
              if (q === 'auto') opt.classList.remove('active');
              else opt.classList.toggle('active', level.height === parseInt(q, 10));
            });
          }
          return;
        }

        if (streamType === 'dash' && streamPlayer) {
          const qualityIndex = streamPlayer.getQualityFor('video');
          const bitrateInfos = streamPlayer.getBitrateInfoListFor('video');
          if (bitrateInfos && bitrateInfos[qualityIndex]) {
            const currentHeight = bitrateInfos[qualityIndex].height;
            elements.qualityOptions.forEach(opt => {
              const q = opt.dataset.quality;
              if (q === 'auto') opt.classList.remove('active');
              else opt.classList.toggle('active', currentHeight === parseInt(q, 10));
            });
            return;
          }
        }

        elements.qualityOptions.forEach(opt => {
          opt.classList.toggle('active', opt.dataset.quality === currentQuality);
        });
      }

      // Quality option event delegation (attached to container if possible)
      if (elements.settingsContainer) {
        elements.settingsContainer.addEventListener('click', (e) => {
          const opt = e.target.closest('.quality-option');
          if (!opt) return;
          e.preventDefault();
          e.stopPropagation();
          selectQuality(opt.dataset.quality);
        });
      }

      // ---------- Timeline & Scrubbing (optimized with RAF and cached rect) ----------
      let isScrubbing = false;
      let wasPaused = false;
      let cachedRect = null;

      // 1. Add the missing function to update the cache
      function updateRectCache() {
        if (!elements.timelineContainer) return;
        cachedRect = elements.timelineContainer.getBoundingClientRect();
      }

      function getTimelineRect() {
        if (cachedRect) return cachedRect;
        updateRectCache(); // Fallback if cache is empty
        return cachedRect || { left: 0, width: 1 };
      }

      let rectDebounce = null;
      function handleScrollResize() {
        if (rectDebounce) clearTimeout(rectDebounce);
        rectDebounce = setTimeout(updateRectCache, 150);
      }
      window.addEventListener('resize', handleScrollResize, { passive: true });

      function handlePointerMove(clientX) {
        if (!elements.timelineContainer) return;
        const rect = getTimelineRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

        if (isScrubbing) {
          elements.timelineContainer.style.setProperty('--preview-position', percent);
          elements.timelineContainer.style.setProperty('--progress-position', percent);
          if (features.previewImages && elements.thumbnailImg) {
            applyThumbnail(elements.thumbnailImg, percent * video.duration);
          }
        } else {
          elements.timelineContainer.style.setProperty('--preview-position', percent);
          if (features.previewImages && elements.previewImg) {
            applyThumbnail(elements.previewImg, percent * video.duration);
          }
        }
      }

      const throttledPointerMove = (clientX) => {
        rafScheduler(() => handlePointerMove(clientX));
      };

      if (elements.timelineContainer) {
        if (window.PointerEvent) {
          elements.timelineContainer.addEventListener('pointerdown', (e) => {
            if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
            e.preventDefault();
            startScrub(e.clientX);
            elements.timelineContainer.setPointerCapture(e.pointerId);

            const onPointerMove = (ev) => { if (isScrubbing) handlePointerMove(ev.clientX); };
            const onPointerUp = (ev) => {
              endScrub(ev.clientX);
              elements.timelineContainer.releasePointerCapture(e.pointerId);
              elements.timelineContainer.removeEventListener('pointermove', onPointerMove);
              elements.timelineContainer.removeEventListener('pointerup', onPointerUp);
              elements.timelineContainer.removeEventListener('pointercancel', onPointerUp);
            };
            elements.timelineContainer.addEventListener('pointermove', onPointerMove);
            elements.timelineContainer.addEventListener('pointerup', onPointerUp);
            elements.timelineContainer.addEventListener('pointercancel', onPointerUp);
          });
          elements.timelineContainer.addEventListener('pointermove', (e) => throttledPointerMove(e.clientX), { passive: true });
        } else {
          // Fallback
          elements.timelineContainer.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            startScrub(e.clientX);
            const onMouseMove = (ev) => { if (isScrubbing) handlePointerMove(ev.clientX); };
            const onMouseUp = (ev) => {
              endScrub(ev.clientX);
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
          elements.timelineContainer.addEventListener('mousemove', (e) => throttledPointerMove(e.clientX));
        }
      }

      function startScrub(clientX) {
        isScrubbing = true;
        wasPaused = video.paused;
        video.pause();
        elements.container?.classList.add('scrubbing');
        
        // 2. Call the correct cache update function here
        updateRectCache(); 
        
        handlePointerMove(clientX);
      }

      function endScrub(clientX) {
        if (!isScrubbing) return;
        const rect = getTimelineRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        isScrubbing = false;
        elements.container?.classList.remove('scrubbing');
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = percent * video.duration;
        }
        if (!wasPaused) video.play().catch(() => {});
      }

      // ---------- Buffer Bar (using progress event only) ----------
      let lastBufferPercent = -1;
      function updateBufferBar() {
        if (!elements.bufferBar) return;
        if (!video.buffered || video.buffered.length === 0) return;

        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) return;

        const currentTime = video.currentTime;
        let bufferEnd = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (currentTime >= start && currentTime <= end) {
            bufferEnd = end;
            break;
          }
          if (end > bufferEnd) bufferEnd = end;
        }

        const percent = Math.min(100, (bufferEnd / duration) * 100);
        if (Math.abs(percent - lastBufferPercent) > 0.5) {
          elements.bufferBar.style.transform = 'scaleX(' + (percent / 100) + ')';
          lastBufferPercent = percent;
          elements.bufferBar.classList.toggle('fully-buffered', percent >= 99.5);
        }
      }

      function startBufferMonitoring() {
        // Already using progress event, no need for interval
      }

      video.addEventListener('progress', throttledBufferUpdate, { passive: true });
      video.addEventListener('loadedmetadata', () => {
        if (elements.totalTime) elements.totalTime.textContent = formatTime(video.duration);
        updateBufferBar();
      });
      video.addEventListener('seeking', throttledBufferUpdate, { passive: true });
      video.addEventListener('seeked', throttledBufferUpdate, { passive: true });

      // ---------- Loading State ----------
      let bufferingTimeout = null;
      video.addEventListener('waiting', () => {
        if (isQualitySwitching) return;
        clearTimeout(bufferingTimeout);
        bufferingTimeout = setTimeout(() => {
          if (elements.container && !isQualitySwitching) elements.container.classList.add('buffering');
        }, 200);
      });
      function clearBuffering() {
        clearTimeout(bufferingTimeout);
        elements.container?.classList.remove('buffering');
        if (isQualitySwitching) finishQualitySwitch();
      }
      video.addEventListener('playing', clearBuffering);
      video.addEventListener('canplaythrough', clearBuffering);

      // ---------- Playback Speed ----------
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      if (elements.speedBtn) {
        elements.speedBtn.addEventListener('click', () => {
          const idx = (speeds.indexOf(video.playbackRate) + 1) % speeds.length;
          video.playbackRate = speeds[idx];
          elements.speedBtn.textContent = speeds[idx] + 'x';
        });
      }

      // ---------- Settings Menu (simplified) ----------
      let settingsMenuOpen = false;
      let settingsCloseTimeout = null;

      if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleSettingsMenu();
        });
      }

      function closeOnOutsideInteraction(e) {
        if (settingsMenuOpen && elements.settingsContainer && !elements.settingsContainer.contains(e.target)) {
          closeSettingsMenu();
        }
      }
      document.addEventListener('click', closeOnOutsideInteraction);
      document.addEventListener('touchend', closeOnOutsideInteraction, { passive: true });

      if (elements.settingsContainer) {
        elements.settingsContainer.addEventListener('mouseenter', () => clearTimeout(settingsCloseTimeout));
        if (!isMobile) {
          elements.settingsContainer.addEventListener('mouseleave', () => {
            if (settingsMenuOpen) settingsCloseTimeout = setTimeout(closeSettingsMenu, 300);
          });
        }
        elements.settingsContainer.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          clearTimeout(settingsCloseTimeout);
        }, { passive: true });
      }

      function positionSettingsMenu() {
        const menu = elements.settingsContainer?.querySelector('.settings-menu');
        if (!menu || !elements.settingsBtn) return;

        // Reset to default (above) to measure
        menu.classList.remove('flip-down');

        // Force layout so offsetHeight is accurate
        const menuHeight = menu.offsetHeight || menu.scrollHeight || 200;
        const btnRect = elements.settingsBtn.getBoundingClientRect();

        // Use the video container as the boundary (works in both normal and fullscreen)
        const containerRect = elements.container
          ? elements.container.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };

        const spaceAbove = btnRect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - btnRect.bottom;

        // Flip below if there's more room below than above
        if (spaceBelow > spaceAbove) {
          menu.classList.add('flip-down');
        }
      }

      function toggleSettingsMenu() {
        settingsMenuOpen = !settingsMenuOpen;
        clearTimeout(settingsCloseTimeout);
        if (settingsMenuOpen) {
          elements.settingsContainer?.classList.add('active');
          // Double-RAF to ensure display:block is painted before measuring
          requestAnimationFrame(() => requestAnimationFrame(() => positionSettingsMenu()));
          // Keep controls visible while menu is open
          showControls();
        } else {
          elements.settingsContainer?.classList.remove('active');
        }
      }

      function closeSettingsMenu() {
        settingsMenuOpen = false;
        elements.settingsContainer?.classList.remove('active');
        clearTimeout(settingsCloseTimeout);
        showControls(); // reset auto-hide timer after menu interaction
      }

      // ---------- Tooltip Repositioning (one-time computation) ----------
      {
        const tooltipButtons = document.querySelectorAll('.video-controls-container .controls button[data-tooltip]');
        function computeTooltipPositions() {
          if (!elements.container) return;
          const bounds = elements.container.getBoundingClientRect();
          tooltipButtons.forEach(btn => {
            const btnRect = btn.getBoundingClientRect();
            const btnCenter = btnRect.left + btnRect.width / 2;
            // Estimate max tooltip width (longest tooltip ~16ch at 0.75em + padding)
            const tooltipHalf = 60;
            btn.classList.remove('tooltip-left', 'tooltip-right');
            if (btnCenter - tooltipHalf < bounds.left) btn.classList.add('tooltip-left');
            else if (btnCenter + tooltipHalf > bounds.right) btn.classList.add('tooltip-right');
          });
        }
        // Compute after layout settles
        requestAnimationFrame(computeTooltipPositions);
        window.addEventListener('resize', () => rafScheduler(computeTooltipPositions), { passive: true });
      }

      // ---------- Time & Duration (RAF throttled) ----------
      function skip(sec) { if (isFinite(video.duration) && video.duration > 0) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + sec)); }

      let lastRenderedTime = '';
      let lastRenderedProgress = -1;
      function updateTimeUI() {
        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) return;

        const timeStr = formatTime(video.currentTime);
        if (timeStr !== lastRenderedTime) {
          lastRenderedTime = timeStr;
          if (elements.currentTime) elements.currentTime.textContent = timeStr;
        }

        if (!isScrubbing && elements.timelineContainer) {
          const progress = video.currentTime / duration;
          if (Math.abs(progress - lastRenderedProgress) > 0.0005) {
            lastRenderedProgress = progress;
            elements.timelineContainer.style.setProperty('--progress-position', progress);
          }
        }
      }
      video.addEventListener('timeupdate', () => rafScheduler(updateTimeUI), { passive: true });

      function formatTime(t) {
        if (isNaN(t)) return '0:00';
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60);
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
      }

      // ---------- Volume ----------
      if (elements.muteBtn) {
        elements.muteBtn.addEventListener('click', () => {
          video.muted = !video.muted;
          elements.muteBtn.setAttribute('data-tooltip', video.muted ? 'Unmute (m)' : 'Mute (m)');
        });
      }
      if (elements.volumeSlider) {
        elements.volumeSlider.addEventListener('input', (e) => {
          video.volume = e.target.value;
          video.muted = e.target.value === '0';
        }, { passive: true });
      }
      video.addEventListener('volumechange', () => {
        if (elements.volumeSlider) elements.volumeSlider.value = video.muted ? 0 : video.volume;
        if (elements.container) elements.container.dataset.volumeLevel = video.muted || video.volume === 0 ? 'muted' : video.volume < 0.5 ? 'low' : 'high';
        if (elements.muteBtn) elements.muteBtn.setAttribute('data-tooltip', video.muted ? 'Unmute (m)' : 'Mute (m)');
      });

      // ---------- View Modes ----------
      if (elements.miniPlayerBtn) elements.miniPlayerBtn.addEventListener('click', toggleMiniPlayer);
      if (elements.theaterBtn) elements.theaterBtn.addEventListener('click', toggleTheater);
      if (elements.fullScreenBtn) elements.fullScreenBtn.addEventListener('click', toggleFullScreen);

      function toggleMiniPlayer() {
        if (features.pictureInPicture) {
          document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture();
        }
      }
      function toggleTheater() {
        elements.container?.classList.toggle('theater');
        if (elements.theaterBtn) {
          elements.theaterBtn.setAttribute('data-tooltip', elements.container?.classList.contains('theater') ? 'Exit theater (t)' : 'Theater mode (t)');
        }
      }
      function toggleFullScreen() {
        if (!features.fullscreen) return;
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else if (elements.container) {
          let fsPromise;
          if (isAppleDevice() && video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
            return;
          }
          if (elements.container.requestFullscreen) {
            fsPromise = elements.container.requestFullscreen();
          } else if (elements.container.webkitRequestFullscreen) {
            fsPromise = elements.container.webkitRequestFullscreen();
          }
          if (fsPromise && fsPromise.then) {
            fsPromise.then(() => {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape-primary').catch(() => screen.orientation.lock('landscape')).catch(() => {});
              }
            }).catch(() => {});
          }
        }
      }

      ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
        document.addEventListener(ev, () => {
          const isFS = document.fullscreenElement || document.webkitFullscreenElement;
          elements.container?.classList.toggle('full-screen', !!isFS);
          if (elements.fullScreenBtn) {
            elements.fullScreenBtn.setAttribute('data-tooltip', isFS ? 'Exit full screen (f)' : 'Full screen (f)');
          }
          if (isFS) showControls();
          else {
            clearTimeout(controlsTimeout);
            elements.container?.classList.remove('controls-visible');
            controlsVisible = false;
            screen.orientation?.unlock();
          }
        })
      );

      video.addEventListener('enterpictureinpicture', () => {
        elements.container?.classList.add('mini-player');
        if (elements.miniPlayerBtn) elements.miniPlayerBtn.setAttribute('data-tooltip', 'Exit mini player (i)');
      });
      video.addEventListener('leavepictureinpicture', () => {
        elements.container?.classList.remove('mini-player');
        if (elements.miniPlayerBtn) elements.miniPlayerBtn.setAttribute('data-tooltip', 'Mini player (i)');
      });

      // ---------- Play/Pause ----------
      if (elements.playPauseBtn) elements.playPauseBtn.addEventListener('click', togglePlayPause);
      video.addEventListener('click', togglePlayPause);
      function togglePlayPause() {
        if (suppressNextVideoClick) return;
        video.paused ? video.play() : video.pause();
      }

      // Cache nav divs for play/pause glow control
      const navDivs = document.querySelectorAll('div.wrapper.topnav div');

      video.addEventListener('play', () => {
        elements.container?.classList.remove('paused');
        if (elements.playPauseBtn) elements.playPauseBtn.setAttribute('data-tooltip', 'Pause (k)');
        for (let i = 0; i < navDivs.length; i++) navDivs[i].style.animationPlayState = 'paused';
      });
      video.addEventListener('pause', () => {
        elements.container?.classList.add('paused');
        if (elements.playPauseBtn) elements.playPauseBtn.setAttribute('data-tooltip', 'Play (k)');
        for (let i = 0; i < navDivs.length; i++) navDivs[i].style.animationPlayState = '';
      });

      // ---------- Controls Auto-Hide ----------
      let controlsTimeout = null, controlsVisible = false, suppressNextVideoClick = false;
      function showControls() {
        if (!elements.container) return;
        if (!controlsVisible) {
          elements.container.classList.add('controls-visible');
          controlsVisible = true;
        }
        clearTimeout(controlsTimeout);
        if (document.fullscreenElement || isMobile) controlsTimeout = setTimeout(hideControls, 3000);
      }
      function hideControls() {
        if (!elements.container || isScrubbing || settingsMenuOpen || video.paused) return;
        elements.container.classList.remove('controls-visible');
        controlsVisible = false;
      }

      if (elements.container) {
        elements.container.addEventListener('mousemove', showControls, { passive: true });
        elements.container.addEventListener('touchstart', (e) => {
          if (e.target === video || e.target === elements.container) {
            if (!controlsVisible) {
              showControls();
              // Suppress the synthetic click so revealing controls doesn't also toggle play/pause
              suppressNextVideoClick = true;
              setTimeout(() => { suppressNextVideoClick = false; }, 300);
            } else {
              hideControls();
            }
          } else showControls();
        }, { passive: true });
        elements.container.addEventListener('touchmove', (e) => {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            e.preventDefault();
          }
        }, { passive: false });
        video.addEventListener('pause', () => { clearTimeout(controlsTimeout); showControls(); });
        video.addEventListener('play', () => {
          if (document.fullscreenElement || isMobile) {
            clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(hideControls, 3000);
          }
        });
        elements.container.addEventListener('mouseleave', () => {
          if (!document.fullscreenElement && !isMobile) {
            clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(hideControls, 500);
          }
        }, { passive: true });
      }

      // ---------- Captions ----------
      let captions = null;
      function initCaptions() {
        const track = video.querySelector('track');
        if (!track) return disableCaptions('No track');

        if (video.textTracks && video.textTracks.length > 0) {
          captions = video.textTracks[0];
          captions.mode = 'hidden';
          features.captions = true;
          track.addEventListener('error', () => disableCaptions('Load failed'));
        } else {
          disableCaptions('Not supported');
        }
      }
      function disableCaptions() {
        features.captions = false;
        if (elements.captionsBtn) {
          elements.captionsBtn.classList.add('hidden');
          elements.captionsBtn.disabled = true;
          elements.captionsBtn.setAttribute('data-tooltip', 'Unavailable');
        }
      }
      function toggleCaptions() {
        if (!features.captions || !captions) return;
        const isHidden = captions.mode === 'hidden';
        captions.mode = isHidden ? 'showing' : 'hidden';
        if (elements.container) elements.container.classList.toggle('captions', isHidden);
        if (elements.captionsBtn) {
          elements.captionsBtn.setAttribute('data-tooltip', isHidden ? 'Captions off (c)' : 'Captions (c)');
        }
      }
      if (elements.captionsBtn) elements.captionsBtn.addEventListener('click', toggleCaptions);

      // ---------- Initialization ----------
      function init() {
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        if (!features.pictureInPicture && elements.miniPlayerBtn) {
          elements.miniPlayerBtn.classList.add('hidden');
          elements.miniPlayerBtn.disabled = true;
        }
        if (!features.fullscreen && elements.fullScreenBtn) {
          elements.fullScreenBtn.classList.add('hidden');
          elements.fullScreenBtn.disabled = true;
        }
        if (isMobile && elements.theaterBtn) {
          elements.theaterBtn.classList.add('hidden');
          elements.theaterBtn.disabled = true;
        }
        initCaptions();
        initThumbnails();
        initStream();
        currentQuality = 'auto';
        elements.qualityOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.quality === 'auto'));
        if (elements.playPauseBtn) elements.playPauseBtn.setAttribute('data-tooltip', 'Play (k)');
      }

      init();
    }
  })();
}