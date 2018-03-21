"use strict";

const NodeHelper = require("node_helper");
const request = require("request");

module.exports = NodeHelper.create({
  start: function() {
    var self = this;

    console.log("Starting node helper for: " + self.name);
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "FETCH_WALLPAPERS") {
      self.config = payload;
      self.fetchWallpapers();
    }
  },

  fetchWallpapers: function() {
    var self = this;
    var url;
    
    if (self.config.source === "bing") {
      url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=" + self.config.maximumEntries + "&mkt=" + self.config.market;
    } else if (self.config.orientation === "vertical") {
      url = "https://www.reddit.com/r/Verticalwallpapers/hot.json";
    } else {
      url = "https://www.reddit.com/r/wallpapers/hot.json";
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
        if (self.config.source === "bing") {
          self.processBingData(JSON.parse(body));
        } else {
          self.processRedditData(JSON.parse(body));
        }
      }
    });
  },

  processBingData: function(data) {
    var self = this;
    var width = (self.config.orientation === "vertical") ? 1080 : 1920;
    var height = (self.config.orientation === "vertical") ? 1920 : 1080;
    var suffix = "_" + width + "x" + height + ".jpg";

    var imageList = [];
    for (var i in data.images) {
      var image = data.images[i];

      imageList.push({
        url: "https://www.bing.com" + image.urlbase + suffix,
        width: width,
        height: height
      });
    }

    self.sendSocketNotification("WALLPAPERS", imageList);
  },

  processRedditData: function(data) {
    var self = this;

    var imageList = [];
    for (var i in data.data.children) {
      var post = data.data.children[i];

      if (post.kind === "t3") {
        var source = post.data.preview.images[0].source;

        imageList.push({
          url: source.url.replace("&amp;", "&"),
          width: source.width,
          height: source.height
        });

        if (imageList.length === self.config.maximumEntries) {
          break;
        }
      }
    }

    self.sendSocketNotification("WALLPAPERS", imageList);
  },
});
