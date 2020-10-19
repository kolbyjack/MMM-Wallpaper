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
  },

  getStyles: function() {
    return ["MMM-Wallpaper.css"];
  },

  start: function() {
    var self = this;

    self.image = null;
    self.nextImage = null;
    self.loadNextImageTimer = null;
    self.imageIndex = 0;
    self.imageClasses = {};

    self.getData();
    setInterval(function() { self.getData(); }, self.config.updateInterval);

    window.onresize = function() { self.updateDom(); };
  },

  notificationReceived: function(notification, payload, sender) {
    var self = this;

    if (notification === "LOAD_NEXT_WALLPAPER") {
      self.loadNextImage();
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

        if (self.image === null && self.images.length > 0) {
          self.image = self.images[self.imageIndex];
          self.updateDom();

          if (self.config.slideInterval > 0) {
            self.loadNextImageTimer = setTimeout(function() { self.loadNextImage(); }, self.config.slideInterval);
          }
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

  getDom: function() {
    var self = this;
    var wrapper = document.createElement("div");

    if (self.image !== null) {
      var img = document.createElement("img");
      var caption = self.image.caption;
      var url = self.getImageUrl(self.image);

      img.style.filter = self.config.filter;
      if (url in self.imageClasses) {
        img.className = self.imageClasses[url];
      } else {
        img.style.opacity = "0";
        img.onload = function() {
          self.imageClasses[img.src] = self.getWallpaperClasses(img);
          img.className = self.imageClasses[img.src];
          img.style.opacity = "1";
        };
      }
      img.src = url;

      wrapper.appendChild(img);

      if (self.nextImage !== null) {
        var nextImg = document.createElement("img");
        var nextUrl = self.getImageUrl(self.nextImage);

        caption = self.nextImage.caption;
        nextImg.style.filter = self.config.filter;
        nextImg.style.opacity = "0";
        if (nextUrl in self.imageClasses) {
          nextImg.className = self.imageClasses[nextUrl];
        }
        nextImg.onload = function() {
          if (!(nextImg.src in self.imageClasses)) {
            self.imageClasses[nextImg.src] = self.getWallpaperClasses(nextImg);
            nextImg.className = self.imageClasses[nextImg.src];
          }
          setTimeout(() => {
            if (self.config.crossfade) {
              nextImg.ontransitionend = function() { img.remove(); };
              nextImg.style.transition = "opacity 1s ease-in-out";
            } else {
              img.remove();
            }
            nextImg.style.opacity = "1";
          }, 1);
          self.image = self.nextImage;
          self.nextImage = null;
        };
        nextImg.src = nextUrl;

        wrapper.appendChild(nextImg);
      }

      if (self.config.caption && caption) {
        var title = document.createElement("div");

        title.innerHTML = caption;
        title.classList.add("title");

        wrapper.appendChild(title);
      }
    }

    return wrapper;
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

  getWallpaperClasses: function(image) {
    var self = this;
    var viewport = self.getViewport();
    var fitVerticalWidth = image.naturalWidth * viewport.height / image.naturalHeight;

    if (fitVerticalWidth >= viewport.width) {
      return `wallpaper ${self.config.size}-wide`;
    } else {
      return `wallpaper ${self.config.size}-tall`;
    }
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

    self.imageIndex = (self.imageIndex + 1) % self.images.length;
    self.nextImage = self.images[self.imageIndex];
    self.updateDom();

    if (self.config.slideInterval > 0) {
      clearTimeout(self.loadNextImageTimer);
      self.loadNextImageTimer = setTimeout(function() { self.loadNextImage(); }, self.config.slideInterval);
    }
  },
});
