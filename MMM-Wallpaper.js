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

  getStyles: function() {
    return ["MMM-Wallpaper.css"];
  },

  start: function() {
    var self = this;

    self.loadNextImageTimer = null;
    self.imageIndex = -1;

    self.wrapper = document.createElement("div");
    self.wrapper.className = "MMM-Wallpaper";

    self.content = document.createElement("div");
    self.wrapper.appendChild(self.content);

    self.title = document.createElement("div");
    self.title.className = "title";
    self.content.appendChild(self.title);

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

    self.imageElement = null;
    self.nextImageElement = null;

    self.getData();
    self.updateTimer = setInterval(() => self.getData(), self.config.updateInterval);
  },

  notificationReceived: function(notification, payload, sender) {
    var self = this;

    if (notification === "MODULE_DOM_CREATED" && self.config.userPresenceAction === "show") {
      self.hide();
    } else if (notification === "LOAD_NEXT_WALLPAPER") {
      self.loadNextImage();
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

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "WALLPAPERS") {
      if (payload.orientation === self.getOrientation() &&
          ((Array.isArray(self.config.source) && self.config.source.includes(payload.source)) ||
           (!Array.isArray(self.config.source) && self.config.source === payload.source)))
      {
        self.images = payload.images.slice(0, self.config.maximumEntries);
        self.imageIndex = self.imageIndex % (self.images.length || 1);

        if (self.imageElement === null && self.images.length > 0) {
          self.loadNextImage();
        }
      }
    }
  },

  getData: function() {
    var self = this;
    var config = Object.assign({}, self.config);

    config.orientation = self.getOrientation();
    self.sendSocketNotification("FETCH_WALLPAPERS", config);
  },

  getOrientation: function() {
    var self = this;

    if (self.config.orientation === "auto") {
      var viewport = self.getViewport();
      return (viewport.width < viewport.height) ? "vertical" : "horizontal";
    }

    return self.config.orientation;
  },

  onImageLoaded: function(imageData, element) {
    var self = this;

    return () => {
      self.resetLoadImageTimer();

      element.className = `wallpaper ${self.config.crossfade ? "crossfade-image" : ""}`;
      element.style.opacity = 1;
      self.title.style.display = "none";

      setTimeout(() => {
        var caption = imageData.caption;
        if (self.config.caption && caption) {
          self.title.innerHTML = caption;
          self.title.style.display = "initial";
        }

        if (self.imageElement !== null) {
          self.content.removeChild(self.imageElement);
        }
        self.imageElement = self.nextImageElement;
        self.nextImageElement = null;
      }, self.config.crossfade ? 1000 : 0);
    };
  },

  createImage: function(imageData) {
    var self = this;
    var img = document.createElement("img");

    img.style.filter = self.config.filter;
    img.style["object-fit"] = self.config.size;
    img.style.opacity = 0;
    img.onload = self.onImageLoaded(imageData, img);
    img.src = self.getImageUrl(imageData);

    return img;
  },

  getDom: function() {
    return this.wrapper;
  },

  getViewport: function() {
    var w = window;
    var e = document.documentElement;
    var g = document.body;

    return {
      width: w.innerWidth || e.clientWidth || g.clientWidth,
      height: w.innerHeight || e.clientHeight || g.clientHeight
    };
  },

  getImageUrl: function(image) {
    var viewport = this.getViewport();
    var url = image.url;

    if ("variants" in image) {
      for (var i in image.variants) {
        var variant = image.variants[i];

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

  loadNextImage: function() {
    var self = this;

    self.resetLoadImageTimer();

    if (self.nextImageElement !== null) {
      self.nextImageElement.onload = null;
      self.content.removeChild(self.nextImageElement);
      self.nextImageElement = null;
    }

    self.imageIndex = (self.imageIndex + 1) % self.images.length;

    const nextImageData = self.images[self.imageIndex];
    if (nextImageData !== null) {
      self.nextImageElement = self.createImage(nextImageData);
      self.content.insertBefore(self.nextImageElement, self.title);
    }
  },

  resetLoadImageTimer: function() {
    const self = this;

    if (self.config.slideInterval > 0) {
      clearTimeout(self.loadNextImageTimer);
      self.loadNextImageTimer = setTimeout(() => self.loadNextImage(), self.config.slideInterval);
    }
  },
});
