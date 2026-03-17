const bgVideoConfig = {
  initialState: "",
  volumeLevel: "muted",
  initialVolume: "0",

  captionsSrc: undefined,
  videoAttrs: { preload: "auto", muted: true, playsinline: "" },
  containerAttrs: { class: "bg-video-wrap" },

  controls: {
    playPause: false,
    volume: false,
    duration: false,
    captions: false,
    speed: false,
    settings: false,
    miniPlayer: false,
    theater: false,
    fullscreen: false
  },

  timeline: {
    enabled: false,
    buffer: false,
    preview: false,
    thumbnail: false
  },

  spinner: false,
  qualityOptions: false,
  speedOptions: false,

  classNames: {
    container: "video-container bg-video",
    controls: "controls",
    timeline: "timeline-container"
  },

  tooltips: false
};

export { bgVideoConfig };
