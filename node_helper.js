"use strict";

const NodeHelper = require("node_helper");
const crypto = require("crypto");
const { createSource } = require("./wallpaper_sources");

module.exports = NodeHelper.create({
  start() {
    console.log(`Starting node helper for: ${this.name}`);
    this.sources = {};
    this.expressApp.use(`/${this.name}/images/`, this.requestHandler.bind(this));
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_WALLPAPERS") {
      this.fetchWallpapers(payload);
    }
  },

  fetchWallpapers(config) {
    if (Array.isArray(config.source)) {
      config.source = config.source[Math.floor(Math.random() * config.source.length)];
    }

    const id = crypto.createHash("sha1").update(`${config.source}::${config.orientation}`).digest("hex");
    if (!(id in this.sources)) {
      this.sources[id] = createSource(this, config, id);
    }

    this.sources[id].refresh();
  },

  requestHandler(request, response) {
    const id = request.url.split("/")[1];

    if (id in this.sources) {
      const source = this.sources[id];
      if (source.requestHandler !== null) {
        request.url = request.url.substring(id.length + 1);
        return source.requestHandler(request, response);
      }
    }

    response.sendStatus(404);
  },

  onSourceUpdated(source) {
    let images = source.imageCache.images.slice(0, source.config.maximumEntries).map(image => ({...image}));
    if (source.requestHandler !== null) {
      const urlPath = `/${this.name}/images/${source.id}/`;
      for (const image of images) {
        image.url = `${urlPath}${image.url.replace(/^\/+/, "")}`;
      }
    }

    this.sendSocketNotification("WALLPAPERS", {
      source: source.config.source,
      orientation: source.config.orientation,
      images: images,
    });
  },
});
