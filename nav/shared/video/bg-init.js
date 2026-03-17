// Background Video Player - Lightweight init
// Reuses the same streaming core (DASH/HLS/native) from the watch player,
// but strips away all UI: no controls, no timeline, no keyboard shortcuts.
// Autoplays muted, loops indefinitely, covers the page as a background.

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function() {
    'use strict';

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBgPlayer);
    } else {
      initBgPlayer();
    }

    function initBgPlayer() {
      var video = document.querySelector('.bg-video-wrap video');
      if (!video) return;

      var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                     (navigator.maxTouchPoints > 1);

      // ---- Streaming config (same sources as watch player) ----
      var STREAM_CONFIG = {
        preferredFormat: 'auto',
        hlsSource: '/assets/hbg/hls/master.m3u8',
        dashSource: '/assets/hbg/dash/manifest.mpd',
        dashEnabled: true,
        hlsEnabled: true
      };

      var streamPlayer = null;
      var streamType = null;

      var features = {
        hls: typeof Hls !== 'undefined' && Hls.isSupported(),
        dash: typeof dashjs !== 'undefined' && dashjs.supportsMediaSource(),
        nativeHls: typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl') !== ''
      };

      // ---- Force background-friendly attrs ----
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.removeAttribute('preload');
      video.setAttribute('preload', 'auto');
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.setAttribute('disablepictureinpicture', '');
      video.setAttribute('disableremoteplayback', '');
      video.addEventListener('contextmenu', function(e) { e.preventDefault(); });

      // ---- Stream init (same priority chain as watch player) ----
      function isAppleDevice() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.userAgentData?.platform === 'macOS' && navigator.maxTouchPoints > 1) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      }

      async function checkFileExists(url) {
        try { var r = await fetch(url, { method: 'HEAD' }); return r.ok; }
        catch { return false; }
      }

      function initDASH() {
        streamType = 'dash';
        streamPlayer = dashjs.MediaPlayer().create();
        streamPlayer.initialize(video, STREAM_CONFIG.dashSource, true);
        streamPlayer.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              stableBufferTime: isMobile ? 6 : 10,
              bufferTimeAtTopQuality: isMobile ? 8 : 15,
              bufferToKeep: isMobile ? 3 : 8,
              bufferPruningInterval: 5
            },
            abr: {
              autoSwitchBitrate: { video: true, audio: true },
              limitBitrateByPortal: true
            }
          }
        });
        streamPlayer.on(dashjs.MediaPlayer.events.ERROR, function() { fallbackToMP4(); });
      }

      function initHLS() {
        streamType = 'hls';
        streamPlayer = new Hls({
          maxBufferLength: isMobile ? 6 : 8,
          maxMaxBufferLength: isMobile ? 10 : 15,
          maxBufferSize: isMobile ? 10 * 1000000 : 20 * 1000000,
          maxBufferHole: 0.5,
          startLevel: -1,
          autoStartLoad: true,
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: isMobile ? 5 : 10
        });
        streamPlayer.loadSource(STREAM_CONFIG.hlsSource);
        streamPlayer.attachMedia(video);
        streamPlayer.on(Hls.Events.ERROR, function(_event, data) {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) streamPlayer.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) streamPlayer.recoverMediaError();
            else fallbackToMP4();
          }
        });
      }

      function initNativeHLS() {
        streamType = 'native';
        video.src = STREAM_CONFIG.hlsSource;
      }

      function fallbackToMP4() {
        if (streamPlayer) {
          streamType === 'hls' ? streamPlayer.destroy() : streamPlayer.reset();
          streamPlayer = null;
        }
        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      async function initStream() {
        var fmt = STREAM_CONFIG.preferredFormat;

        if (STREAM_CONFIG.dashEnabled && (fmt === 'dash' || fmt === 'auto') && features.dash && !isAppleDevice()) {
          if (await checkFileExists(STREAM_CONFIG.dashSource)) { initDASH(); return; }
        }
        if (STREAM_CONFIG.hlsEnabled && (fmt === 'hls' || fmt === 'auto') && features.hls) {
          if (await checkFileExists(STREAM_CONFIG.hlsSource)) { initHLS(); return; }
        }
        if (STREAM_CONFIG.hlsEnabled && features.nativeHls) {
          if (await checkFileExists(STREAM_CONFIG.hlsSource)) { initNativeHLS(); return; }
        }
        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      // ---- Autoplay ----
      function tryAutoplay() {
        var p = video.play();
        if (p && p.catch) p.catch(function() {});
      }

      video.addEventListener('canplay', tryAutoplay, { once: true });

      // ---- Loop (belt-and-suspenders for streams that don't honour loop attr) ----
      video.addEventListener('ended', function() {
        video.currentTime = 0;
        tryAutoplay();
      });

      // ---- Cleanup ----
      window.addEventListener('beforeunload', function() {
        if (streamPlayer) {
          streamType === 'hls' ? streamPlayer.destroy() : streamPlayer.reset();
        }
      });

      // ---- Go ----
      initStream();
    }
  })();
}
