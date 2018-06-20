"use strict";

const NodeHelper = require("node_helper");
const request = require("request");
const fs = require("fs");

function shuffle(a) {
  var source = a.slice(0);
  var result = [];
  var i, j;

  for (i = a.length; i > 0; --i) {
    j = Math.floor(Math.random() * i);
    result.push(source[j]);
    source[j] = source[i];
  }

  return result;
}

module.exports = NodeHelper.create({
  start: function() {
    var self = this;

    console.log("Starting node helper for: " + self.name);
    self.cache = {};
    self.firetv = JSON.parse(fs.readFileSync(__dirname + "/firetv.json"));
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "FETCH_WALLPAPERS") {
      self.fetchWallpapers(payload);
    }
  },

  fetchWallpapers: function(config) {
    var self = this;
    var cache_key = self.getCacheKey(config);
    var url;

    if (cache_key in self.cache &&
        config.maximumEntries <= self.cache[cache_key].images.length &&
        Date.now() < self.cache[cache_key].expires)
    {
      self.sendWallpaperUpdate(config);
      return;
    }

    var source = config.source.toLowerCase();
    if (source === "firetv") {
      self.sendSocketNotification("WALLPAPERS", {
        "source": config.source,
        "orientation": config.orientation,
        "images": shuffle(self.firetv.images).slice(0, config.maximumEntries),
      });
      return;
    } else if (source.startsWith("/r/")) {
      url = "https://www.reddit.com" + config.source + "/hot.json";
    } else {
      url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=" + config.maximumEntries;
    }

    request({
      url: url,
      method: "GET",
      headers: { "cache-control": "no-cache" },
    },
    function(error, response, body) {
      if (error) {
        self.sendSocketNotification("FETCH_ERROR", { error: error });
        return console.error(" ERROR - MMM-Wallpaper: " + error);
      }

      if (response.statusCode === 200) {
        self.processData(config, JSON.parse(body));
      }
    });
  },

  sendWallpaperUpdate: function(config) {
    var self = this;
    var cache_key = self.getCacheKey(config);

    self.sendSocketNotification("WALLPAPERS", {
      "source": config.source,
      "orientation": config.orientation,
      "images": self.cache[cache_key].images,
    });
  },

  processData: function(config, data) {
    var self = this;
    var cache_key = self.getCacheKey(config);
    var images;

    if (config.source.toLowerCase().startsWith("/r/")) {
      images = self.processRedditData(config, data);
    } else {
      images = self.processBingData(config, data);
    }

    if (images.length === 0) {
      return;
    }

    self.cache[cache_key] = {
      "expires": Date.now() + config.updateInterval * 0.9,
      "images": images,
    };

    self.sendWallpaperUpdate(config);
  },

  processBingData: function(config, data) {
    var self = this;
    var width = (config.orientation === "vertical") ? 1080 : 1920;
    var height = (config.orientation === "vertical") ? 1920 : 1080;
    var suffix = "_" + width + "x" + height + ".jpg";

    var images = [];
    for (var i in data.images) {
      var image = data.images[i];

      images.push({
        url: "https://www.bing.com" + image.urlbase + suffix,
        width: width,
        height: height,
        caption: image.copyright,
      });
    }

    return images;
  },

  processRedditData: function(config, data) {
    var self = this;

    var images = [];
    for (var i in data.data.children) {
      var post = data.data.children[i];

      if (post.kind === "t3" && !post.data.pinned && !post.data.stickied) {
        var source = post.data.preview.images[0].source;

        images.push({
          url: source.url.replace("&amp;", "&"),
          width: source.width,
          height: source.height,
          caption: post.data.title,
        });

        if (images.length === config.maximumEntries) {
          break;
        }
      }
    }

    return images;
  },

  getCacheKey: function(config) {
    return config.source + "::" + config.orientation;
  },
});
