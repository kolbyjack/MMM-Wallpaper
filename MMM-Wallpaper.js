// MMM-Wallpaper.js

Module.register("MMM-Wallpaper", {
  // Default module config
  defaults: {
    source: "bing",
    updateInterval: 60 * 60 * 1000,
    slideInterval: 5 * 60 * 1000,
    maximumEntries: 10,
    market: "en-US",
    filter: "grayscale(0.5) brightness(0.5)",
    orientation: "auto"
  },

  start: function() {
    var self = this;

    self.loaded = false;
    self.imageIndex = 0;
    self.getData();
    setInterval(function() {
      self.updateDom();
      if (self.loaded) {
        self.imageIndex = (self.imageIndex + 1) % self.imageList.length;
      }
    }, self.config.slideInterval);

    window.onresize = function() {
      self.updateDom();
    };
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "WALLPAPERS") {
      self.imageList = payload;
      if (!self.loaded) {
        self.loaded = true;
        self.updateDom();
      }
    }
  },

  getData: function() {
    var self = this;
    var config = Object.assign({}, self.config);

    if (config.orientation === "auto") {
      var viewport = self.getViewport();
      config.orientation = (viewport.width < viewport.height) ? "vertical" : "horizontal";
    }

    self.sendSocketNotification("FETCH_WALLPAPERS", config);
  },

  scheduleUpdate: function(delay) {
    var self = this;
    var timeout = self.config.updateInterval;

    if (delay !== undefined && delay >= 0) {
      timeout = delay;
    }

    setTimeout(function() { self.getData(); }, timeout);
  },

  getDom: function() {
    var self = this;
    var wrapper = document.createElement("div");

    if (self.loaded) {
      var viewport = self.getViewport();

      if (self.imageIndex >= self.imageList.length) {
        self.imageIndex = 0;
      }

      var data = self.imageList[self.imageIndex];
      var img = document.createElement("img");

      img.style.position = "fixed";
      img.style.top = (viewport.height - data.height) * 0.5 + "px";
      img.style.left = (viewport.width - data.width) * 0.5 + "px";
      img.style.filter = self.config.filter;
      img.src = data.url;

      wrapper.appendChild(img);
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
  }
});
