"use strict";

const NodeHelper = require("node_helper");
const crypto = require("crypto");
const { createSource } = require("./wallpaper_sources");

if (typeof (fetch) === "undefined") {
  fetch = require("fetch");
}

module.exports = NodeHelper.create({
  start: function() {
    console.log(`Starting node helper for: ${this.name}`);
    this.cache = {};
    this.handlers = {};
    this.sources = {};
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "FETCH_WALLPAPERS") {
      this.fetchWallpapers(payload);
    }
  },

  fetchWallpapers: function(config) {
    if (Array.isArray(config.source)) {
      config.source = config.source[Math.floor(Math.random() * config.source.length)];
    }

    const cacheEntry = this.getCacheEntry(config);

    if (config.maximumEntries <= cacheEntry.images.length && Date.now() < cacheEntry.expires) {
      this.sendResult(config);
      return;
    }

    this.getSource(config).refresh();
  },

  getSource: function(config) {
    const entry = this.getCacheEntry(config);

    if (!(entry.key in this.sources)) {
      this.sources[entry.key] = createSource(this, config, entry.key);
    }
    this.sources[entry.key].config = config;
    return this.sources[entry.key];
  },

  cacheResult: function(id, images) {
    const source = this.sources[id];

    if (source && Array.isArray(images) && images.length > 0) {
      const config = source.config;
      const cache = this.getCacheEntry(config);

      if (id in this.handlers) {
        const urlPath = `/${this.name}/images/${id}/`;
        for (const image of images) {
          image.url = `${urlPath}${image.url.replace(/^\/+/, "")}`;
        }
      }

      cache.expires = Date.now() + config.updateInterval * 0.9;
      cache.images = images;

      this.sendResult(config);
    }
  },

  registerImageHandler(id, handler) {
    const urlPath = `/${this.name}/images/${id}/`;

    if (!(id in this.handlers)) {
      this.handlers[id] = handler;
      this.expressApp.use(urlPath, handler);
    }

    return urlPath;
  },

  sendResult: function(config) {
    const result = this.getCacheEntry(config);

    this.sendSocketNotification("WALLPAPERS", {
      "source": config.source,
      "orientation": config.orientation,
      "images": result.images.slice(0, config.maximumEntries),
    });
  },

  getCacheEntry: function(config) {
    const key = crypto.createHash("sha1").update(`${config.source}::${config.orientation}`).digest("hex");

    if (!(key in this.cache)) {
      this.cache[key] = {
        "key": key,
        "expires": Date.now(),
        "images": [],
      };
    }

    return this.cache[key];
  },
});
