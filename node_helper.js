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

function fmt(f) {
    var parts = f.split("{}");
    var result = parts[0];
    var i;

    for (i = 1; i < parts.length; ++i) {
        result += arguments[i] + parts[i];
    }

    return result;
}

module.exports = NodeHelper.create({
  start: function() {
    var self = this;

    console.log(fmt("Starting node helper for: {}", self.name));
    self.cache = {};
    self.firetv = JSON.parse(fs.readFileSync(fmt("{}/firetv.json", __dirname)));
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
      self.request(config, {
        url: fmt("https://www.reddit.com{}/hot.json", config.source),
        headers: {
          "user-agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)"
        },
      });
    } else if (source.startsWith("icloud:")) {
      self.iCloudState = "webstream";
      self.request(config, {
        method: "POST",
        url: fmt("https://p04-sharedstreams.icloud.com/{}/sharedstreams/webstream", config.source.substring(7)),
        body: '{"streamCtag":null}',
      });
    } else if (source.startsWith("flickr-group:")) {
      self.request(config, {
        url: fmt("https://api.flickr.com/services/feeds/groups_pool.gne?format=json&id={}", config.source.substring(13)),
      });
    } else if (source.startsWith("flickr-user:")) {
      self.request(config, {
        url: fmt("https://api.flickr.com/services/feeds/photos_public.gne?format=json&id={}", config.source.substring(12)),
      });
    } else if (source.startsWith("flickr-user-faves:")) {
      self.request(config, {
        url: fmt("https://api.flickr.com/services/feeds/photos_faves.gne?format=json&id={}", config.source.substring(18)),
      });
    } else {
      self.request(config, {
        url: fmt("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n={}", config.maximumEntries),
      });
    }
  },

  request: function(config, params) {
    var self = this;

    if (!("headers" in params)) {
      params.headers = {};
    }

    if (!("cache-control" in params.headers)) {
      params.headers["cache-control"] = "no-cache";
    }

    request(params,
      function(error, response, body) {
        if (error) {
          self.sendSocketNotification("FETCH_ERROR", { error: error });
          return console.error(fmt(" ERROR - MMM-Wallpaper: {}", error));
        }

        if (response.statusCode < 400 && body.length > 0) {
          self.processResponse(response, body, config);
        }
      }
    );
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
      images = self.processRedditData(config, JSON.parse(body));
    } else if (source.startsWith("icloud:")) {
      images = self.processiCloudData(response, JSON.parse(body), config);
    } else if (source.startsWith("flickr-")) {
      images = self.processFlickrData(config, body);
    } else {
      images = self.processBingData(config, JSON.parse(body));
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
        url: fmt("https://www.bing.com{}{}", image.urlbase, suffix),
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

      if (post.kind === "t3" && !post.data.pinned && !post.data.stickied && post.data.post_hint === "image") {
        images.push({
          url: post.data.url.replace("&amp;", "&"),
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
        self.request(config, {
          method: "POST",
          url: fmt("https://{}/{}/sharedstreams/webstream", self.iCloudHost, album),
          body: '{"streamCtag":null}'
        });
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

        self.request(config, {
          mthod: "POST",
          url: fmt("https://{}/{}/sharedstreams/webasseturls", self.iCloudHost, album),
          body: JSON.stringify({"photoGuids": photoGuids}),
        });
      }
    } else if (self.iCloudState === "webasseturls") {
      for (var guid in body.items) {
        var p = body.items[guid];
        var loc = body.locations[p.url_location];
        var host = loc.hosts[Math.floor(Math.random() * loc.hosts.length)];
        var meta = self.iCloudMetadata[guid];

        images.push({
          url: fmt("{}://{}{}", loc.scheme, host, p.url_path),
          caption: meta.caption,
        });
      }
    }

    return images;
  },

  processFlickrData: function(config, body) {
    var self = this;
    var data = JSON.parse(body.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));

    var images = [];
    for (var i in data.items) {
      var post = data.items[i];

      images.push({
        url: post.media.m.replace(/_m\./, "_h."),
        caption: post.title,
      });

      if (images.length === config.maximumEntries) {
        break;
      }
    }

    return images;
  },

  getCacheKey: function(config) {
    return config.source + "::" + config.orientation;
  },
});
