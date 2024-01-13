"use strict";

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const Flickr = require("flickr-sdk");
const NodeCache = require("node-cache");
if (typeof (fetch) === "undefined") {
  fetch = require("fetch");
}

function shuffle(a) {
  var source = a.slice(0);
  var result = [];
  var i, j;

  for (i = a.length; i > 0; --i) {
    j = Math.floor(Math.random() * i);
    result.push(source[j]);
    source[j] = source[i - 1];
  }

  return result;
}

function parseBool(val) {
    var num = +val;
    return !!(val && isNaN(num) ? String(val).toLowerCase().replace(!1,'') : num);
}

function pick(a) {
  if (Array.isArray(a)) {
    return a[Math.floor(Math.random() * a.length)];
  } else {
    return a;
  }
}

function z(n) {
  return ((0 <= n && n < 10) ? "0" : "") + n;
}

function b62decode(s) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = s.split("").reduce((result, c) => result * 62 + alphabet.indexOf(c), 0);
  if (result.length === 1) {
    result = `0${result}`;
  }
  return result;
}

module.exports = NodeHelper.create({
  start: function() {
    var self = this;

    console.log(`Starting node helper for: ${self.name}`);
    self.cache = {};
    self.handlers = {};
    self.firetv = null;
    self.chromecast = null;
  },

  socketNotificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "FETCH_WALLPAPERS") {
      self.fetchWallpapers(payload);
    }
  },

  fetchWallpapers: function(config) {
    var self = this;

    config.source = pick(config.source);
    const cacheEntry = self.getCacheEntry(config);
    if (config.maximumEntries <= cacheEntry.images.length && Date.now() < cacheEntry.expires) {
      self.sendResult(config);
      return;
    }

    var source = config.source.toLowerCase();
    if (source === "firetv") {
      if (self.firetv === null) {
        self.firetv = JSON.parse(fs.readFileSync(`${__dirname}/firetv.json`));
      }
      self.cacheResult(config, shuffle(self.firetv.images));
    } else if (source === "chromecast") {
      if (self.chromecast === null) {
        self.chromecast = JSON.parse(fs.readFileSync(`${__dirname}/chromecast.json`));
      }
      self.cacheResult(config, shuffle(self.chromecast));
    } else if (source.startsWith("local:")) {
      self.readdir(config);
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      let url = config.source;
      if (config.addCacheBuster) {
        url = `${url}${(url.indexOf("?") != -1) ? "&" : "?"}mmm-wallpaper-ts=${Date.now()}`;
      }
      self.cacheResult(config, [{
        url: url,
        caption: config.source,
      }]);
    } else if (source.startsWith("/r/")) {
      self.request(config, {
        url: `https://www.reddit.com${config.source}/hot.json`,
        headers: {
          "user-agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)"
        },
      });
    } else if (source.startsWith("/user/")) {
      self.request(config, {
        url: `https://www.reddit.com${config.source}.json`,
        headers: {
          "user-agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)"
        },
      });
    } else if (source === "pexels") {
      self.request(config, {
        url: `https://api.pexels.com/v1/search?query=${config.pexels_search}`,
        headers: {
          Authorization: config.pexels_key
        },
      });
    } else if (source.startsWith("icloud:")) {
      const album = config.source.substring(7).trim();
      const partition = b62decode((album[0] === "A") ? album[1] : album.substring(1, 3));
      self.iCloudHost = `p${partition}-sharedstreams.icloud.com`;
      self.iCloudState = "webstream";
      self.request(config, {
        method: "POST",
        url: `https://${self.iCloudHost}/${album}/sharedstreams/webstream`,
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)",
        },
        body: '{"streamCtag":null}',
      });
    } else if (source.startsWith("flickr-api:")) {
      self.fetchFlickrApi(config);
    } else if (source.startsWith("lightroom:")) {
      self.request(config, {
        url: `https://${config.source.substring(10).trim()}`,
      });
    } else if (source.startsWith("synology-moments:")) {
      self.synologyMomentsState = "create_session";
      self.request(config, {
        url: config.source.substring(17).trim(),
      });
    } else if (source.startsWith("metmuseum:")) {
      var args = config.source.substring(10).split(",");
      self.request(config, {
        url: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&departmentId=${args[0]}&isHighlight=${args[1]}&q=${args[2]}`,
      });
    } else if (source.startsWith("nasa:")) {
      const searchTerm = config.source.split(":")[1];
      if (!searchTerm || searchTerm.length === 0 || searchTerm === "") {
        console.error("MMM-Wallpaper: Please specify search term for NASA API");
        return;
      }
      self.request(config, {
        url: `https://images-api.nasa.gov/search?q=${searchTerm}`
      });
    } else if ((source === "apod") || (source === "apodhd")) {
      let startDate = new Date();
      startDate.setDate(startDate.getDate() - config.maximumEntries);
      startDate = `${startDate.getFullYear()}-${z(startDate.getMonth() + 1)}-${z(startDate.getDate())}`;
      self.request(config, {
        url: `https://api.nasa.gov/planetary/apod?api_key=${config.nasaApiKey}&start_date=${startDate}`,
      });
    } else {
      self.request(config, {
        url: `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${config.maximumEntries}`,
      });
    }
  },

  readdir: function(config) {
    const self = this;
    const result = self.getCacheEntry(config);
    const sourcePath = config.source.substring(6).trim();
    const urlPath = `/${self.name}/images/${result.key}/`;
    const fileMatcher = /\.(?:a?png|avif|gif|p?jpe?g|jfif|pjp|svg|webp|bmp)$/;

    if (!(result.key in self.handlers)) {
      var handler = express.static(sourcePath);

      self.handlers[result.key] = handler;
      self.expressApp.use(urlPath, handler);
    }

    async function getFiles(dir, prefix) {
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
      let result = [];

      for (const dirent of dirents) {
        const entpath = path.resolve(dir, dirent.name);
        if (dirent.isDirectory() && config.recurseLocalDirectories) {
          result = result.concat(await getFiles(entpath, `${prefix}${dirent.name}/`));
        } else if (dirent.isFile() && dirent.name.toLowerCase().match(fileMatcher) != null) {
          result.push({
            url: `${urlPath}${prefix.substring(1)}${dirent.name}`,
            caption: entpath,
          });
        }
      }

      return result;
    };

    getFiles(sourcePath, "/")
      .then(images => {
        if (config.shuffle) {
          images = shuffle(images);
        }

        self.cacheResult(config, images);
      });
  },

  request: function(config, params) {
    var self = this;

    if (!("headers" in params)) {
      params.headers = {};
    }

    if (!("cache-control" in params.headers)) {
      params.headers["cache-control"] = "no-cache";
    }

    fetch(params.url, params)
      .then((response) => {
        response.text().then((body) => {
          self.processResponse(response, body, config);
        });
      });
  },

  cacheResult: function(config, images) {
    var self = this;
    var cache = self.getCacheEntry(config);

    cache.expires = Date.now() + config.updateInterval * 0.9;
    cache.images = images;

    self.sendResult(config);
  },

  sendResult: function(config) {
    var self = this;
    var result = self.getCacheEntry(config);

    self.sendSocketNotification("WALLPAPERS", {
      "source": config.source,
      "orientation": config.orientation,
      "images": result.images.slice(0, config.maximumEntries),
    });
  },

  processResponse: function(response, body, config) {
    var self = this;
    var images;

    var source = config.source.toLowerCase();
    if (source.startsWith("/r/") || source.startsWith("/user/")) {
      images = self.processRedditData(config, JSON.parse(body));
    } else if (source.startsWith("icloud:")) {
      images = self.processiCloudData(response, JSON.parse(body), config);
    } else if (source === "pexels") {
      images = self.processPexelsData(config, JSON.parse(body));
    } else if (source.startsWith("lightroom:")) {
      images = self.processLightroomData(config, body);
    } else if (source.startsWith("synology-moments:")) {
      images = self.processSynologyMomentsData(response, body, config);
    } else if (source.startsWith("metmuseum:")) {
      images = self.processMetMuseumData(config, JSON.parse(body));
    } else if (source.startsWith("nasa:")) {
      images = self.processNasaData(config, JSON.parse(body));
    } else if ((source === "apod") || (source === "apodhd")) {
      images = self.processApodData(config, JSON.parse(body));
    } else {
      images = self.processBingData(config, JSON.parse(body));
    }

    if (images.length === 0) {
      return;
    }

    self.cacheResult(config, images);
  },

  processPexelsData: function (config, data) {
    var self = this;
    var orientation = (config.orientation === "vertical") ? "portrait" : "landscape";

    var images = [];
    for (var image of data.photos) {
      images.push({
        url: image.src[orientation],
        caption: `Photographer: ${image.photographer}`,
      });
    }

    return images;
  },

  processBingData: function(config, data) {
    var self = this;
    var width = (config.orientation === "vertical") ? 1080 : 1920;
    var height = (config.orientation === "vertical") ? 1920 : 1080;
    var suffix = `_${width}x${height}.jpg`;

    var images = [];
    for (var image of data.images) {
      images.push({
        url: `https://www.bing.com${image.urlbase}${suffix}`,
        caption: image.copyright,
      });
    }

    return images;
  },

  processRedditData: function(config, data) {
    var self = this;

    var images = [];
    for (var post of data.data.children) {
      if (post.kind === "t3"
          && !post.data.pinned
          && !post.data.stickied
          && post.data.post_hint === "image"
          && (config.nsfw || !post.data.over_18)) {
        var variants = post.data.preview.images[0].resolutions.slice(0);

        variants.push(post.data.preview.images[0].source);
        variants.map((v) => { v.url = v.url.split("&amp;").join("&"); return v; });
        variants.sort((a, b) => { return a.width * a.height - b.width * b.height; });

        images.push({
          url: post.data.url.replace("&amp;", "&"),
          caption: post.data.title,
          variants: variants,
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
    var album = config.source.substring(7).trim();
    var images = [];

    if (self.iCloudState === "webstream") {
      if (response.status === 330) {
        self.iCloudHost = body["X-Apple-MMe-Host"] || self.iCloudHost;
        self.request(config, {
          method: "POST",
          url: `https://${self.iCloudHost}/${album}/sharedstreams/webstream`,
          body: '{"streamCtag":null}'
        });
      } else if (response.status === 200) {
        if (config.shuffle) {
          body.photos = shuffle(body.photos);
        }
        self.iCloudPhotos = body.photos.filter((p) => p != null && p.mediaAssetType !== "video").slice(0, config.maximumEntries);
        self.iCloudState = "webasseturls";

        var photoGuids = self.iCloudPhotos.map((p) => { return p.photoGuid; });
        self.request(config, {
          method: "POST",
          url: `https://${self.iCloudHost}/${album}/sharedstreams/webasseturls`,
          body: JSON.stringify({"photoGuids": photoGuids}),
        });
      }
    } else if (self.iCloudState === "webasseturls") {
      for (var checksum in body.items) {
        var p = body.items[checksum];
        var loc = body.locations[p.url_location];
        var host = loc.hosts[Math.floor(Math.random() * loc.hosts.length)];

        for (var photo of self.iCloudPhotos) {
          for (var d in photo.derivatives) {
            var m = photo.derivatives[d];
            if (m.checksum === checksum) {
              m.url = `${loc.scheme}://${host}${p.url_path}`;
              break;
            }
          }
        }
      }

      images = self.iCloudPhotos.map((p) => {
        var result = {
          url: null,
          caption: p.caption,
          variants: [],
        };

        for (var i in p.derivatives) {
          var d = p.derivatives[i];

          if (+d.width > 0) {
            result.variants.push({
              url: d.url,
              width: +d.width,
              height: +d.height,
            });
          }
        }

        result.variants.sort((a, b) => { return a.width * a.height - b.width * b.height; });
        result.url = result.variants[result.variants.length - 1].url;

        return result;
      });
    }

    return images;
  },

  processLightroomData: function(config, body) {
    var self = this;
    var data = body.match(/data-srcset="[^"]+/g);

    if (config.shuffle) {
      data = shuffle(data);
    }

    var images = [];
    for (var srcset of data) {
      var variants = srcset.substring(13).split(",");
      var result = {
        url: null,
        variants: [],
      };

      for (var v of variants) {
        var d = v.split(" ");
        var width = Number.parseInt(d[1]);

        if (width > 0) {
          result.variants.push({
            url: d[0],
            width: width,
            height: 1,
          });
        }
      }

      if (result.variants.length === 0) {
        continue;
      }

      result.variants.sort((a, b) => { return a.width * a.height - b.width * b.height; });
      result.url = result.variants[result.variants.length - 1].url;
      images.push(result);

      if (images.length === config.maximumEntries) {
        break;
      }
    }

    return images;
  },

  processSynologyMomentsData: function(response, body, config) {
    var self = this;
    var url = new URL(config.source.substring(17).trim());
    var last_slash = url.pathname.lastIndexOf("/");
    var api_path = `${url.pathname.substring(0, last_slash)}/webapi/entry.cgi`;
    var api_url = `${url.protocol}//${url.host}${api_path}`;
    var album = url.pathname.substring(last_slash + 1);
    var images = [];
    var cache_entry = self.getCacheEntry(config);

    if (!("image_map" in cache_entry)) {
      cache_entry.image_map = {};
      cache_entry.session_cookie = null;
    }

    if (!(cache_entry.key in self.handlers)) {
      // https://stackoverflow.com/a/10435819
      var handler = (oreq, ores, next) => {
        const options = {
          host: url.host,
          port: url.port,
          protocol: url.protocol,
          path: cache_entry.image_map[oreq.url],
          method: "GET",
          headers: {
            "cache-control": "none",
            "cookie": cache_entry.session_cookie,
          },
        };

        const module = (url.protocol === "http:") ? http : https;
        const preq = module.request(options, (pres) => {
          ores.writeHead(pres.statusCode, pres.headers);
          pres.on("data", (chunk) => { ores.write(chunk); });
          pres.on("close", () => { ores.end(); });
          pres.on("end", () => { ores.end(); });
        }).on("error", e => {
          try {
            ores.writeHead(500);
            ores.write(e.message);
          } catch (e) {
          }
          ores.end();
        });

        preq.end();
      };

      self.handlers[cache_entry.key] = handler;
      self.expressApp.use(`/${self.name}/images/${cache_entry.key}/`, handler);
    }

    if (response.status !== 200) {
      console.error(`ERROR: ${response.status} -- ${body}`);
    } else if (self.synologyMomentsState === "create_session") {
      if ("set-cookie" in response.headers) {
        cache_entry.session_cookie = response.headers["set-cookie"][0].split(";")[0];
        self.synologyMomentsState = "browse_item";
        self.request(config, {
          method: "POST",
          url: api_url,
          body: `additional=["thumbnail","resolution","orientation","video_convert","video_meta"]&offset=0&limit=${config.maximumEntries}&passphrase="${album}"&api="SYNO.Photo.Browse.Item"&method="list"&version=3`,
          headers: {
            "cookie": cache_entry.session_cookie,
            "x-syno-sharing": album,
          },
        });
      }
    } else {
      body = JSON.parse(body);
      images = body.data.list.map((i) => {
        cache_entry.image_map[`/${i.id}`] = `${api_path}?id=${i.id}&cache_key=${i.additional.thumbnail.cache_key}&type="unit"&size="xl"&api="SYNO.Photo.Thumbnail"&method="get"&version=1&_sharing_id="${album}"&passphrase="${album}"`;
        return {
          url: `/${self.name}/images/${cache_entry.key}/${i.id}`,
        };
      });
    }

    return images;
  },

  processMetMuseumData: function(config, data) {
    var self = this;
    var images = [];

    if (data.objectIDs === null) {
      return [];
    }

    if (config.shuffle) {
      data.objectIDs = shuffle(data.objectIDs);
    }

    var objectIDs = data.objectIDs.slice(0, Math.min(60, config.maximumEntries));
    var pendingRequests = objectIDs.length;

    for (var id of objectIDs) {
      var url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;

      fetch(url)
        .then(response => response.json())
        .then(obj => {
          if (obj.isPublicDomain) {
            images.push({
              url: obj.primaryImageSmall,
              caption: `${obj.title} - ${obj.artistDisplayName}`,
            });
          }
        })
        .finally(() => {
          if (--pendingRequests === 0) {
            self.cacheResult(config, images);
          }
        });
    }

    return [];
  },

  /* NASA APIs documented under https://api.nasa.gov/.
    This accesses the NASA Image and Video Library. 
    Currently, it only loads the thumbnails, which in most cases have good enough quality.
    For NASA API usage without an API key, there are hourly limits of about 1,000 requests. 
    */
  processNasaData: function (config, data) {
    if (!data.collection.items) {
      return [];
    }
    // filter for images, since the API also returns videos
    const filteredImages = data.collection.items.filter((item) => item.data[0]['media_type'] === 'image');
    let images = [];
    for (const image of filteredImages) {
      if (image.links && image.links.length > 0) {
        images.push({
          url: image.links[0].href,
          caption: image.data[0].description_508 ? image.data[0].description_508 : image.data[0].title
        });
      }
    }

    return images;
  },

  processApodData: function (config, data) {
    const images = [];
    const key = (config.source === "apod") ? "url" : "hdurl";

    for (const image of data) {
      if ((image.media_type === "image") && (key in image)) {
        images.unshift({
          url: image[key],
          caption: image.title,
        });
      }
    }

    return images;
  },

  fetchFlickrApi: function(config) {
    const self = this;
    const sources = config.source.substring(11).split(';');

    if (!self.flickr) {
      self.flickr = new Flickr(config.flickrApiKey);
      self.flickr.favorites.getPhotos = self.flickr.favorites.getList;
      self.flickrFeeds = new Flickr.Feeds();
    }
    if (!self.flickrDataCache) {
      self.flickrDataCache = new NodeCache();
    }

    const promises = [];
    for (const source of sources) {
      promises.push(new Promise((resolve, reject) => self.fetchOneFlickrSource(config, source, resolve)));
    }
    Promise.all(promises).then((results) => {
      let images = [];
      for (const result of results) {
        images.push(...result);
      }
      // Each source fetches up to maximumImages images (in case some have fewer).
      // Apply shuffle now, as the consumer will truncate.
      if (config.shuffle) {
        images = shuffle(images);
      }
      return images; // processFlickrPhotos truncates the array to maximumEntries
    }).then((images) => {
      return new Promise((resolve, reject) => self.processFlickrPhotos(config, images, resolve));
    }).then((images) => self.cacheResult(config, images));
  },

  fetchOneFlickrSource: function(config, source, resolve) {
    const self = this;
    const args = source.split('/').filter(s => s.length > 0);
    if (args[0] === "publicPhotos") {
      self.flickrFeeds.publicPhotos({
        per_page: config.flickrResultsPerPage,
      }).then(res => {
        self.processFlickrFeedPhotos(config, res.body.items, resolve);
      });
    } else if (args[0] === "tags" && args.length > 1) {
      self.flickrFeeds.publicPhotos({
        tags: args[1],
        tagmode: (args.length > 2) ? args[2] : "all",
        per_page: config.flickrResultsPerPage,
      }).then(res => {
        self.processFlickrFeedPhotos(config, res.body.items, resolve);
      });
    } else if (args[0] === "photos" && args.length > 1) {
      if (args.length === 4 && args[2] === "galleries") {
        self.fetchFlickrApiPhotos(config, "galleries", "photos", {
          gallery_id: args[3],
          extras: "owner_name",
        }, resolve);
      } else {
        self.flickr.people.findByUsername({
          username: args[1],
        }).then(res => {
          if (args.length === 2) {
            self.fetchFlickrApiPhotos(config, "people", "photos", {
              user_id: res.body.user.id,
              extras: "owner_name",
            }, resolve);
          } else if (args.length === 3 && args[2] === "favorites") {
            self.fetchFlickrApiPhotos(config, "favorites", "photos", {
              user_id: res.body.user.id,
              extras: "owner_name",
            }, resolve);
          } else if (args.length === 4) {
            if (args[2] === "albums") {
              self.fetchFlickrApiPhotos(config, "photosets", "photoset", {
                user_id: res.body.user.id,
                photoset_id: args[3],
                extras: "owner_name",
              }, resolve);
            }
          }
        });
      }
    } else if (args[0] === "groups" && args.length > 1) {
      self.flickr.urls.lookupGroup({
        url: `https://www.flickr.com/groups/${args[1]}/`,
      }).then(res => {
        self.fetchFlickrApiPhotos(config, "groups.pools", "photos", {
          group_id: res.body.group.id,
          extras: "owner_name",
        }, resolve);
      });
    } else {
      console.warn(`Unrecognised Flickr source ${source}, ignoring`);
      resolve([]);
    }
  },

  fetchFlickrApiPhotos: function(config, sourceType, resultType, args, resolve) {
    const self = this;
    let source = self.flickr;

    for (let s of sourceType.split(".")) {
      source = source[s];
    }

    args.per_page = args.per_page || config.flickrResultsPerPage;
    source.getPhotos(args).then(res => {
      resolve(res.body[resultType].photo.map(p => {
        return {
          id: p.id,
          title: p.title,
          owner: p.ownername,
        }
      }));
    });
  },

  processFlickrFeedPhotos: function(config, items, resolve) {
    const self = this;
    resolve(items.map(i => {
      return {
        id: i.link.split("/").filter(s => s.length > 0).slice(-1)[0],
        title: i.title,
        owner: i.author.split('"').filter(s => s.length > 0).slice(-2)[0],
      }
    }));
  },

  processFlickrPhotos: function(config, photos, resolve) {
    const self = this;
    const images = [];

    photos = photos.slice(0, config.maximumEntries);
    let pendingRequests = photos.length;

    for (let p of photos) {
      const cacheResult = self.flickrDataCache.get(p.id);
      if (cacheResult !== undefined) {
        images.push(cacheResult);
        if (--pendingRequests === 0) {
          resolve(images);
        }
        continue;
      }

      self.flickr.photos.getSizes({
        photo_id: p.id,
      }).then(res => {
        const result = {
          url: null,
          caption: `${p.title} (by ${p.owner})`,
          variants: [],
        };

        for (let s of res.body.sizes.size) {
          if (s.media === "photo") {
            result.variants.push({
              url: s.source,
              width: +s.width,
              height: +s.height,
            });
          }
        }

        if (result.variants.length > 0) {
          let selection = result.variants.reduce((prev, variant) => {
            return ((variant.width <= config.maxWidth) && (variant.height <= config.maxHeight)) ? variant : prev;
          }, undefined);
          if (selection !== undefined) {
            result.url = selection.url;
            self.flickrDataCache.set(p.id, result, config.flickrDataCacheTime);
            images.push(result);
          }
        }

        if (--pendingRequests === 0) {
          resolve(images);
        }
      }).catch(err => {
        if (--pendingRequests === 0) {
          resolve(images);
        }
      });
    }
  },

  getCacheEntry: function(config) {
    var self = this;
    var key = crypto.createHash("sha1").update(`${config.source}::${config.orientation}`).digest("hex");

    if (!(key in self.cache)) {
      self.cache[key] = {
        "key": key,
        "expires": Date.now(),
        "images": [],
      };
    }

    return self.cache[key];
  },
});
