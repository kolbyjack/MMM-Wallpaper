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
    var method = "GET";
    var body = undefined;

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
    } else if (source.startsWith("icloud:")) {
      method = "POST";
      url = "https://p04-sharedstreams.icloud.com/" + config.source.substring(7) + "/sharedstreams/webstream";
      body = '{"streamCtag":null}';
      self.iCloudState = "webstream";
    } else {
      url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=" + config.maximumEntries;
    }

    self.request(method, url, body, config);
  },

  request: function(method, url, body, config) {
    var self = this;

    request({
      url: url,
      method: method,
      headers: { "cache-control": "no-cache" },
      body: body,
    },
    function(error, response, body) {
      if (error) {
        self.sendSocketNotification("FETCH_ERROR", { error: error });
        return console.error(" ERROR - MMM-Wallpaper: " + error);
      }

      if (response.statusCode < 400 && body.length > 0) {
        self.processResponse(response, JSON.parse(body), config);
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

  processResponse: function(response, body, config) {
    var self = this;
    var cache_key = self.getCacheKey(config);
    var images;

    var source = config.source.toLowerCase();
    if (source.startsWith("/r/")) {
      images = self.processRedditData(config, body);
    } else if (source.startsWith("icloud:")) {
      images = self.processiCloudData(response, body, config);
    } else {
      images = self.processBingData(config, body);
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
          caption: post.data.title,
        });

        if (images.length === config.maximumEntries) {
          break;
        }
      }
    }

    return images;
  },

  processiCloudData: function(response, body, config) {
    var self = this;
    var album = config.source.substring(7);
    var images = [];

    if (self.iCloudState === "webstream") {
      if (response.statusCode === 330) {
        self.iCloudHost = body["X-Apple-MMe-Host"];
        self.request("POST", "https://" + self.iCloudHost + "/" + album + "/sharedstreams/webstream", '{"streamCtag":null}', config);
      } else if (response.statusCode === 200) {
        var photos = shuffle(body.photos).slice(0, config.maximumEntries);
        var photoGuids = photos.map((p) => { return p.photoGuid; });

        self.iCloudState = "webasseturls";
        self.iCloudMetadata = photos.reduce((o, p) => {
          if (p.derivatives.mediaAssetType === "video") {
            return o;
          }

          for (var d in p.derivatives) {
            var meta = p.derivatives[d];

            o[meta.checksum] = {
              caption: p.caption
            };
          }

          return o
        }, {});

        self.request("POST", "https://" + self.iCloudHost + "/" + album + "/sharedstreams/webasseturls", JSON.stringify({"photoGuids": photoGuids}), config);
      }
    } else if (self.iCloudState === "webasseturls") {
      for (var guid in body.items) {
        var p = body.items[guid];
        var loc = body.locations[p.url_location];
        var host = loc.hosts[Math.floor(Math.random() * loc.hosts.length)];
        var meta = self.iCloudMetadata[guid];

        images.push({
          url: loc.scheme + "://" + host + p.url_path,
          caption: meta.caption,
        });
      }
    }

    return images;
  },

  getCacheKey: function(config) {
    return config.source + "::" + config.orientation;
  },
});
