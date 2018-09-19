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
  },

  getStyles: function() {
    return ["MMM-Wallpaper.css"];
  },

  start: function() {
    var self = this;

    self.image = null;
    self.nextImage = null;
    self.imageIndex = 0;

    self.getData();
    setInterval(function() { self.getData(); }, self.config.updateInterval);

    window.onresize = function() { self.updateDom(); };
  },

  notificationReceived: function(notification, payload, sender) {
    // Do nothing
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "WALLPAPERS") {
      if (payload.source === self.config.source && payload.orientation === self.getOrientation()) {
        self.images = payload.images.slice(0, self.config.maximumEntries);
        self.imageIndex = self.imageIndex % self.images.length;

        if (self.image === null) {
          self.image = self.images[self.imageIndex];
          self.updateDom();

          setInterval(function() {
            self.imageIndex = (self.imageIndex + 1) % self.images.length;
            self.nextImage = self.images[self.imageIndex];
            self.updateDom();
          }, self.config.slideInterval);
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

      img.className = "wallpaper " + self.getWallpaperFitType(self.image);
      img.style.filter = self.config.filter;
      img.src = self.image.url;

      wrapper.appendChild(img);

      if (self.nextImage !== null) {
        var nextImg = document.createElement("img");

        caption = self.nextImage.caption;
        nextImg.className = "wallpaper " + self.getWallpaperFitType(self.nextImage);
        nextImg.style.filter = self.config.filter;
        nextImg.src = self.nextImage.url;
        nextImg.onload = function() {
          nextImg.style.transition = "opacity 1s ease-in-out";
          nextImg.style.opacity = "1";
          self.image = self.nextImage;
          self.nextImage = null;
        };

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

  getWallpaperFitType: function(image) {
    var self = this;
    var viewport = self.getViewport();
    var fitVerticalWidth = image.width * viewport.height / image.height;
    var fitHorizontalHeight = image.height * viewport.width / image.width;

    if (fitVerticalWidth >= viewport.width) {
      return "wide";
    } else {
      return "tall";
    }
  },
});
