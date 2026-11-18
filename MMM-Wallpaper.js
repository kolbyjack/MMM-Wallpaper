// MMM-Wallpaper.js

Module.register("MMM-Wallpaper", {
  // Default module config
  defaults: {
    source: "bing",
    updateInterval: 60 * 60 * 1000,
    slideInterval: 5 * 60 * 1000,
    maximumEntries: 10,
    filter: "grayscale(0.5) brightness(0.5)",
    orientation: "auto",
    caption: true,
    crossfade: true,
    kenBurnsEffect: false,
    maxWidth: Number.MAX_SAFE_INTEGER,
    maxHeight: Number.MAX_SAFE_INTEGER,
    nsfw: true,
    size: "cover",
    shuffle: true,
    addCacheBuster: true,
    userPresenceAction: "none",
    fillRegion: true,
    width: "auto",
    height: "auto",
    flickrApiKey: "",
    flickrDataCacheTime: 24 * 60 * 60 * 1000,
    flickrResultsPerPage: 500, // Flickr API is limited to 500 photos per page
    fadeEdges: false,
  },

  getStyles() {
    return ["MMM-Wallpaper.css"];
  },

  start() {
    const self = this;

    self.loadNextImageTimer = null;
    self.slideTransitionTimer = null;
    self.imageIndex = -1;

    self.wrapper = document.createElement("div");
    self.wrapper.className = "MMM-Wallpaper";

    self.content = document.createElement("div");
    self.wrapper.appendChild(self.content);

    if (self.config.fadeEdges) {
      self.topGradient = document.createElement("div");
      self.topGradient.className = "top-gradient";
      self.content.appendChild(self.topGradient);

      self.bottomGradient = document.createElement("div");
      self.bottomGradient.className = "bottom-gradient";
      self.content.appendChild(self.bottomGradient);
    }

    if (self.config.fillRegion) {
      self.content.className = "content-fill";
    } else {
      self.content.className = "content";
      self.content.style.width = self.config.width;
      self.content.style.height = self.config.height;
    }

    self.currentSlide = null;
    self.nextSlide = null;

    self.getData();
    self.updateTimer = setInterval(() => self.getData(), self.config.updateInterval);
  },

  notificationReceived(notification, payload, sender) {
    const self = this;

    if (notification === "MODULE_DOM_CREATED" && self.config.userPresenceAction === "show") {
      self.hide();
    } else if (notification === "LOAD_NEXT_WALLPAPER") {
      self.loadNextImage();
    } else if (notification === "LOAD_PREVIOUS_WALLPAPER") {
      self.loadPreviousImage();
    } else if (notification === "USER_PRESENCE") {
      if (self.config.userPresenceAction === "show") {
        payload ? self.show() : self.hide();
      } else if (self.config.userPresenceAction === "hide") {
        payload ? self.hide() : self.show();
      }
    } else if (notification === "UPDATE_WALLPAPER_CONFIG") {
      if (payload instanceof String) {
        self.config.source = payload;
      } else {
        Object.assign(self.config, payload);
      }

      clearInterval(self.updateTimer);
      self.getData();
      self.updateTimer = setInterval(() => self.getData(), self.config.updateInterval);
    }
  },

  socketNotificationReceived(notification, payload) {
    const self = this;

    if ((notification === "WALLPAPERS") && self.notificationAppliesToUs(payload)) {
      self.images = payload.images.slice(0, self.config.maximumEntries);
      self.imageIndex = self.imageIndex % (self.images.length || 1);

      if (self.currentSlide === null && self.images.length > 0) {
        self.loadNextImage();
      }
    }
  },

  notificationAppliesToUs(payload) {
    const self = this;

    if (payload.orientation !== self.getOrientation()) {
      return false;
    }

    if (payload.source === self.config.source) {
      return true;
    }

    if (Array.isArray(self.config.source)) {
      for (let source of self.config.source) {
        if ((payload.source === source) || ((typeof(source) === "object") && (payload.source === source.source))) {
          return true;
        }
      }
    }

    return false;
  },

  getData() {
    const self = this;
    let config = Object.assign({}, self.config);

    if (Array.isArray(config.source)) {
      config.source = config.source[Math.floor(Math.random() * config.source.length)];
    }

    if ((config.source !== null) && (typeof(config.source) === "object") && (!Array.isArray(config.source))) {
      const source = config.source;
      delete config.source;
      Object.assign(config, source);
    }

    config.orientation = self.getOrientation();
    self.sendSocketNotification("FETCH_WALLPAPERS", config);
  },

  getOrientation() {
    const self = this;

    if (self.config.orientation === "auto") {
      const viewport = self.getViewport();
      return (viewport.width < viewport.height) ? "vertical" : "horizontal";
    }

    return self.config.orientation;
  },

  onImageLoaded(imageData, element) {
    const self = this;

    return () => {
      if (self.nextSlide !== element) {
        return;
      }

      self.resetLoadImageTimer();

      const previousSlide = self.currentSlide;
      if (self.config.kenBurnsEffect) {
        self.applyKenBurns(element);
      }
      element.className = `wallpaper-slide ${self.config.crossfade ? "crossfade-slide" : ""}`;
      element.style.opacity = 1;

      if (previousSlide === null) {
        self.currentSlide = element;
        self.nextSlide = null;
      } else if (self.config.crossfade) {
        previousSlide.style.opacity = 0;
        self.slideTransitionTimer = setTimeout(() => self.promoteSlide(previousSlide, element), 1000);
      } else {
        self.promoteSlide(previousSlide, element);
      }
    };
  },

  promoteSlide(previousSlide, nextSlide) {
    const self = this;

    if (self.nextSlide !== nextSlide) {
      return;
    }

    if (previousSlide && previousSlide.parentNode === self.content) {
      self.content.removeChild(previousSlide);
    }

    self.currentSlide = nextSlide;
    self.nextSlide = null;
    self.slideTransitionTimer = null;
  },

  applyKenBurns(slide) {
    const image = slide.querySelector(".wallpaper");
    const origins = ["top left", "top right", "bottom left", "bottom right"];
    const origin = origins[Math.floor(Math.random() * origins.length)];
    const duration = this.config.slideInterval > 0 ? this.config.slideInterval : 30000;

    image.style.setProperty("--ken-burns-origin", origin);
    image.style.setProperty("--ken-burns-duration", `${duration}ms`);
    image.classList.add("ken-burns-image");
    image.classList.add(Math.random() < 0.5 ? "ken-burns-zoom-in" : "ken-burns-zoom-out");
  },

  createSlide(imageData) {
    const self = this;
    const slide = document.createElement("div");
    slide.className = "wallpaper-slide crossfade-slide";
    slide.style.opacity = 0;

    const img = document.createElement("img");
    img.className = "wallpaper";
    img.style.filter = self.config.filter;
    img.style["object-fit"] = self.config.size;
    img.onload = self.onImageLoaded(imageData, slide);
    img.src = self.getImageUrl(imageData);
    slide.appendChild(img);

    if (self.config.caption && imageData.caption) {
      const caption = document.createElement("div");
      caption.className = "title";
      caption.innerHTML = imageData.caption;
      slide.appendChild(caption);
    }

    return slide;
  },

  getDom() {
    return this.wrapper;
  },

  getViewport() {
    const w = window;
    const e = document.documentElement;
    const g = document.body;

    return {
      width: w.innerWidth || e.clientWidth || g.clientWidth,
      height: w.innerHeight || e.clientHeight || g.clientHeight
    };
  },

  getImageUrl(image) {
    const viewport = this.getViewport();
    let url = image.url;

    if ("variants" in image) {
      for (const i in image.variants) {
        const variant = image.variants[i];

        if (variant.width > this.config.maxWidth || variant.height > this.config.maxHeight) {
          break;
        }

        url = variant.url;

        if (variant.width >= viewport.width && variant.height >= viewport.height) {
          break;
        }
      }
    }

    return url;
  },

  loadNextImage() {
    this.loadImage((this.imageIndex + 1) % this.images.length);
  },

  loadPreviousImage() {
    this.loadImage((this.imageIndex - 1 + this.images.length) % this.images.length);
  },

  loadImage(index) {
    const self = this;

    self.resetLoadImageTimer();

    if (self.slideTransitionTimer !== null) {
      clearTimeout(self.slideTransitionTimer);
      self.slideTransitionTimer = null;
    }

    if (self.nextSlide !== null) {
      const image = self.nextSlide.querySelector("img");
      if (image.complete && image.naturalWidth > 0) {
        if (self.currentSlide && self.currentSlide.parentNode === self.content) {
          self.content.removeChild(self.currentSlide);
        }
        self.currentSlide = self.nextSlide;
      } else {
        image.onload = null;
        if (self.nextSlide.parentNode === self.content) {
          self.content.removeChild(self.nextSlide);
        }
      }
      self.nextSlide = null;
    }

    self.imageIndex = index;

    const nextImageData = self.images[self.imageIndex];
    if (nextImageData !== null) {
      self.nextSlide = self.createSlide(nextImageData);
      self.content.insertBefore(self.nextSlide, self.content.firstChild);
    }
  },

  resetLoadImageTimer() {
    const self = this;

    if (self.config.slideInterval > 0) {
      clearTimeout(self.loadNextImageTimer);
      self.loadNextImageTimer = setTimeout(() => self.loadNextImage(), self.config.slideInterval);
    }
  },
});
