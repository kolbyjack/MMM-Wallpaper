"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const https = require("https");
const Flickr = require("flickr-sdk");
const NodeCache = require("node-cache");

if (typeof (fetch) === "undefined") {
  fetch = require("fetch");
}

class WallpaperSource {
  constructor(module, config, id) {
    this.module = module;
    this.config = config;
    this.id = id;
    this.requestHandler = null;
    this.imageCache = {
      images: [],
      expires: Date.now(),
    };
  }

  request(params) {
    if (!("headers" in params)) {
      params.headers = {};
    }
    if (!("cache-control" in params.headers)) {
      params.headers["cache-control"] = "no-cache";
    }

    fetch(params.url, params).then(response => response.text().then(body => {
      const images = this.processResponse(body, response);

      if (Array.isArray(images) && images.length > 0) {
        this.cacheResult(images);
      }
    }));
  }

  cacheResult(images) {
    if (Array.isArray(images) && (images.length > 0)) {
      this.imageCache.expires = Date.now() + this.config.updateInterval * 0.9;
      this.imageCache.images = images;

      this.module.onSourceUpdated(this);
    }
  }

  fetch() {
    throw new Error("WallpaperSource.fetch must be implemented");
  }

  processResponse(body, response) {
    throw new Error("WallpaperSource.processResponse must be implemented");
  }

  refresh() {
    if ((this.config.maximumEntries <= this.imageCache.images.length) && (Date.now() < this.imageCache.expires)) {
      this.module.onSourceUpdated(this);
    } else {
      this.fetch();
    }
  }

  shuffle(items) {
    const source = items.slice(0);
    const result = [];
    let i, j;

    for (i = items.length; i > 0; --i) {
      j = Math.floor(Math.random() * i);
      result.push(source[j]);
      source[j] = source[i - 1];
    }

    return result;
  }
}

class ApodSource extends WallpaperSource {
  static matches(source) {
    return source === "apod" || source === "apodhd";
  }

  padDatePart(value) {
    return (value >= 0 && value < 10) ? `0${value}` : `${value}`;
  }

  fetch() {
    const startDate = new Date();

    startDate.setDate(startDate.getDate() - this.config.maximumEntries);
    const dateStr = `${this.padDatePart(startDate.getFullYear() % 100)}${this.padDatePart(startDate.getMonth() + 1)}${this.padDatePart(startDate.getDate())}`;

    this.request({ url: `https://science.nasa.gov/wp-json/wp/v2/apod-basic?date_from=${dateStr}` });
  }

  processResponse(body) {
    const images = [];

    for (const image of JSON.parse(body)) {
      if (image.media_type !== "image" || !("hdurl" in image)) {
        continue;
      }

      let url = image.hdurl;

      if (this.config.source === "apod") {
        const parsed = new URL(url);

        url = parsed.origin + parsed.pathname;
      }

      images.unshift({ url, caption: image.title });
    }
    return images;
  }
}

class BingSource extends WallpaperSource {
  static matches(source) {
    return source === "bing";
  }

  constructor(module, config, id) {
    super(module, config, id);

    const width = config.orientation === "vertical" ? 1080 : 1920;
    const height = config.orientation === "vertical" ? 1920 : 1080;
    this.suffix = `_${width}x${height}.jpg`;
  }

  fetch() {
    this.request({ url: `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${this.config.maximumEntries}` });
  }

  processResponse(body) {
    return JSON.parse(body).images.map(image => ({ url: `https://www.bing.com${image.urlbase}${this.suffix}`, caption: image.copyright }));
  }
}

class ChromecastSource extends WallpaperSource {
  static matches(source) {
    return source === "chromecast";
  }

  fetch() {
    this.request({ url: "https://clients3.google.com/cast/chromecast/home/v/c9541b08" });
  }

  processResponse(body) {
    const initState = eval(body.match(/JSON\.parse\('[^']+?\'\)/)[0]);

    return this.shuffle(initState[0].map(entry => ({ url: entry[0], caption: entry[1] })));
  }
}

class DirectUrlSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("http://") || source.startsWith("https://");
  }

  fetch() {
    let url = this.config.source;

    if (this.config.addCacheBuster) {
      url = `${url}${(url.indexOf("?") !== -1) ? "&" : "?"}mmm-wallpaper-ts=${Date.now()}`;
    }
    this.cacheResult([{ url, caption: this.config.source }]);
  }
}

class FireTvSource extends WallpaperSource {
  static matches(source) {
    return source === "firetv";
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.images = JSON.parse(fs.readFileSync(`${__dirname}/firetv.json`)).images;
  }

  fetch() {
    this.cacheResult(this.shuffle(this.images));
  }
}

class FlickrSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("flickr-api:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.sources = config.source.substring(11).split(";");
    this.flickr = new Flickr(config.flickrApiKey);
    this.flickr.favorites.getPhotos = this.flickr.favorites.getList;
    this.feeds = new Flickr.Feeds();
    this.dataCache = new NodeCache();
  }

  fetch() {
    Promise.all(this.sources.map(source => this.fetchOneSource(source))).then(results => {
      let photos = [...new Map(results.flat().map(p => [p.id, p])).values()];

      if (this.config.shuffle) {
        photos = this.shuffle(photos);
      }

      return this.processPhotos(photos);
    }).then(images => this.cacheResult(images));
  }

  fetchOneSource(source) {
    const args = source.split("/").filter(part => part.length > 0);

    if (args[0] === "publicPhotos") {
      return this.fetchFeed({ per_page: this.config.flickrResultsPerPage });
    }
    if (args[0] === "tags" && args.length > 1) {
      return this.fetchFeed({ tags: args[1], tagmode: args[2] || "all", per_page: this.config.flickrResultsPerPage });
    }
    if (args[0] === "photos" && args.length > 1) {
      if (args.length === 4 && args[2] === "galleries") {
        return this.fetchApiPhotos("galleries", "photos", { gallery_id: args[3], extras: "owner_name" });
      }

      return this.flickr.people.findByUsername({ username: args[1] }).then(res => {
        const user_id = res.body.user.id;

        if (args.length === 2) {
          return this.fetchApiPhotos("people", "photos", { user_id, extras: "owner_name" });
        }
        if (args.length === 3 && args[2] === "favorites") {
          return this.fetchApiPhotos("favorites", "photos", { user_id, extras: "owner_name" });
        }
        if (args.length === 4 && args[2] === "albums") {
          return this.fetchApiPhotos("photosets", "photoset", { user_id, photoset_id: args[3], extras: "owner_name" });
        }

        return [];
      });
    }
    if (args[0] === "groups" && args.length > 1) {
      return this.flickr.urls.lookupGroup({ url: `https://www.flickr.com/groups/${args[1]}/` }).then(res => this.fetchApiPhotos("groups.pools", "photos", { group_id: res.body.group.id, extras: "owner_name" }));
    }

    console.warn(`Unrecognised Flickr source ${source}, ignoring`);
    return Promise.resolve([]);
  }

  fetchFeed(args) {
    return this.feeds.publicPhotos(args).then(res => res.body.items.map(item => ({
      id: item.link.split("/").filter(part => part.length > 0).slice(-1)[0],
      title: item.title,
      owner: item.author.split('"').filter(part => part.length > 0).slice(-2)[0],
    })));
  }

  fetchApiPhotos(sourceType, resultType, args) {
    let source = this.flickr;

    for (const part of sourceType.split(".")) {
      source = source[part];
    }
    args.per_page = args.per_page || this.config.flickrResultsPerPage;
    return source.getPhotos(args).then(res => res.body[resultType].photo.map(photo => ({ id: photo.id, title: photo.title, owner: photo.ownername })));
  }

  processPhotos(photos) {
    photos = photos.slice(0, this.config.maximumEntries);
    return Promise.all(photos.map(photo => {
      const cached = this.dataCache.get(photo.id);

      if (cached !== undefined) {
        return Promise.resolve(cached);
      }

      return this.flickr.photos.getSizes({ photo_id: photo.id }).then(res => {
        const variants = res.body.sizes.size.filter(size => size.media === "photo").map(size => ({ url: size.source, width: +size.width, height: +size.height }));
        const selected = variants.reduce((prev, variant) => variant.width <= this.config.maxWidth && variant.height <= this.config.maxHeight ? variant : prev, undefined);

        if (selected === undefined) {
          return null;
        }

        const result = { url: selected.url, caption: `${photo.title} (by ${photo.owner})`, variants };

        this.dataCache.set(photo.id, result, this.config.flickrDataCacheTime);
        return result;
      }).catch(() => null);
    })).then(images => images.filter(image => image !== null));
  }
}

class ICloudSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("icloud:");
  }

  b62decode(value) {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    return value.split("").reduce((result, character) => result * 62 + alphabet.indexOf(character), 0);
  }

  fetch() {
    const album = this.config.source.substring(7).trim();
    const partition = this.b62decode((album[0] === "A") ? album[1] : album.substring(1, 3));

    this.host = `p${partition}-sharedstreams.icloud.com`;
    this.state = "webstream";
    this.photos = [];
    this.request({ method: "POST", url: `https://${this.host}/${album}/sharedstreams/webstream`, headers: { "Content-Type": "text/plain", "User-Agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)" }, body: '{"streamCtag":null}' });
  }

  processResponse(body, response) {
    const data = JSON.parse(body);
    const album = this.config.source.substring(7).trim();
    let images = [];

    if (this.state === "webstream") {
      if (response.status === 330) {
        this.host = data["X-Apple-MMe-Host"] || this.host;
        this.request({ method: "POST", url: `https://${this.host}/${album}/sharedstreams/webstream`, body: '{"streamCtag":null}' });
      } else if (response.status === 200) {
        if (this.config.shuffle) {
          data.photos = this.shuffle(data.photos);
        }

        this.photos = data.photos.filter(p => p != null).slice(0, this.config.maximumEntries);
        this.state = "webasseturls";
        this.request({ method: "POST", url: `https://${this.host}/${album}/sharedstreams/webasseturls`, body: JSON.stringify({ photoGuids: this.photos.map(p => p.photoGuid) }) });
      }
    } else if (this.state === "webasseturls") {
      for (const checksum in data.items) {
        const item = data.items[checksum];
        const loc = data.locations[item.url_location];
        const host = loc.hosts[Math.floor(Math.random() * loc.hosts.length)];

        for (const photo of this.photos) {
          for (const derivative of Object.values(photo.derivatives)) {
            if (derivative.checksum === checksum) {
              derivative.url = `${loc.scheme}://${host}${item.url_path}`;
            }
          }
        }
      }
      images = this.photos.map(photo => {
        const variants = Object.entries(photo.derivatives)
          .filter(([key, d]) => +d.width > 0 && key !== "PosterFrame")
          .map(([, d]) => ({ url: d.url, width: +d.width, height: +d.height }));

        variants.sort((a, b) => a.width * a.height - b.width * b.height);
        return { url: variants[variants.length - 1].url, caption: photo.caption, variants };
      });
    }

    return images;
  }
}

class JsonSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("json+http://") || source.startsWith("json+https://");
  }

  fetch() {
    let url = this.config.source.substring(5);

    if (this.config.addCacheBuster) {
      url = `${url}${(url.indexOf("?") !== -1) ? "&" : "?"}mmm-wallpaper-ts=${Date.now()}`;
    }
    this.request({ url });
  }

  processResponse(body) {
    return JSON.parse(body) || [];
  }
}

class LightroomSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("lightroom:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.url = `https://${config.source.substring(10).trim()}`;
  }

  fetch() {
    this.request({ url: this.url });
  }

  processResponse(body) {
    let data = body.match(/data-srcset="[^"]+/g);

    if (this.config.shuffle) {
      data = this.shuffle(data);
    }

    const images = [];

    for (const srcset of data) {
      const variants = srcset.substring(13).split(",").map(v => {
        const parts = v.split(" ");

        return { url: parts[0], width: Number.parseInt(parts[1]), height: 1 };
      }).filter(v => v.width > 0);
      if (!variants.length) {
        continue;
      }

      variants.sort((a, b) => a.width - b.width);
      images.push({ url: variants[variants.length - 1].url, variants });
      if (images.length === this.config.maximumEntries) {
        break;
      }
    }

    return images;
  }
}

class LocalSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("local:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.sourcePath = config.source.substring(6).trim();
    this.requestHandler = express.static(this.sourcePath);
  }

  fetch() {
    const fileMatcher = /\.(?:a?png|avif|gif|p?jpe?g|jfif|pjp|svg|webp|bmp)$/;

    const getFiles = async (dir, prefix) => {
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
      let images = [];

      for (const dirent of dirents) {
        const entpath = path.resolve(dir, dirent.name);

        if (dirent.isDirectory() && this.config.recurseLocalDirectories) {
          images = images.concat(await getFiles(entpath, `${prefix}${dirent.name}/`));
        } else if (dirent.isFile() && dirent.name.toLowerCase().match(fileMatcher) !== null) {
          images.push({ url: `${prefix}${dirent.name}`, caption: entpath });
        }
      }
      return images;
    };

    getFiles(this.sourcePath, "/").then(images => {
      this.cacheResult(this.config.shuffle ? this.shuffle(images) : images);
    });
  }
}

class MetMuseumSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("metmuseum:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.searchArgs = config.source.substring(10).split(",");
  }

  fetch() {
    this.request({ url: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&departmentId=${this.searchArgs[0]}&isHighlight=${this.searchArgs[1]}&q=${this.searchArgs[2]}` });
  }

  processResponse(body) {
    const data = JSON.parse(body);

    if (data.objectIDs === null) {
      return [];
    }
    if (this.config.shuffle) {
      data.objectIDs = this.shuffle(data.objectIDs);
    }

    const objectIDs = data.objectIDs.slice(0, Math.min(60, this.config.maximumEntries));
    let pending = objectIDs.length;
    const images = [];

    if (!pending) {
      return [];
    }

    for (const id of objectIDs) {
      fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
        .then(response => response.json())
        .then(object => {
          if (object.isPublicDomain) {
            images.push({ url: object.primaryImageSmall, caption: `${object.title} - ${object.artistDisplayName}` });
          }
        })
        .finally(() => {
          if (--pending === 0) {
            this.cacheResult(images);
          }
        });
    }
    return [];
  }
}

class NasaSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("nasa:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.searchTerm = config.source.split(":")[1];
  }

  fetch() {
    if (!this.searchTerm) {
      console.error("MMM-Wallpaper: Please specify search term for NASA API");
      return;
    }

    this.request({ url: `https://images-api.nasa.gov/search?q=${this.searchTerm}` });
  }

  processResponse(body) {
    const items = JSON.parse(body).collection.items;

    if (!items) {
      return [];
    }

    return items.filter(item => item.data[0].media_type === "image" && item.links && item.links.length > 0).map(item => ({ url: item.links[0].href, caption: item.data[0].description_508 || item.data[0].title }));
  }
}

class PexelsSource extends WallpaperSource {
  static matches(source) {
    return source === "pexels";
  }

  fetch() {
    this.request({ url: `https://api.pexels.com/v1/search?query=${this.config.pexels_search}`, headers: { Authorization: this.config.pexels_key } });
  }

  processResponse(body) {
    const orientation = (this.config.orientation === "vertical") ? "portrait" : "landscape";

    return JSON.parse(body).photos.map(image => ({ url: image.src[orientation], caption: `Photographer: ${image.photographer}` }));
  }
}

class RedditSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("/r/") || source.startsWith("/user/");
  }

  fetch() {
    const path = this.config.source;

    const url = path.toLowerCase().startsWith("/r/")
      ? `https://www.reddit.com${path}/hot.json`
      : `https://www.reddit.com${path}.json`;
    this.request({ url, headers: { "user-agent": "MagicMirror:MMM-Wallpaper:v1.0 (by /u/kolbyhack)" } });
  }

  processResponse(body) {
    const images = [];

    for (const post of JSON.parse(body).data.children) {
      if (post.kind === "t3" && !post.data.pinned && !post.data.stickied && post.data.post_hint === "image" && (this.config.nsfw || !post.data.over_18)) {
        const variants = post.data.preview.images[0].resolutions.slice(0);

        variants.push(post.data.preview.images[0].source);
        variants.map(v => { v.url = v.url.split("&amp;").join("&"); return v; });
        variants.sort((a, b) => a.width * a.height - b.width * b.height);
        images.push({ url: post.data.url.replace("&amp;", "&"), caption: post.data.title, variants });
        if (images.length === this.config.maximumEntries) {
          break;
        }
      }
    }
    return images;
  }
}

class SynologyMomentsSource extends WallpaperSource {
  static matches(source) {
    return source.startsWith("synology-moments:");
  }

  constructor(module, config, id) {
    super(module, config, id);

    this.sharedAlbumUrlText = config.source.substring(17).trim();
    const sharedAlbumUrl = new URL(this.sharedAlbumUrlText);
    const lastSlash = sharedAlbumUrl.pathname.lastIndexOf("/");
    this.apiPath = `${sharedAlbumUrl.pathname.substring(0, lastSlash)}/webapi/entry.cgi`;
    this.apiUrl = `${sharedAlbumUrl.protocol}//${sharedAlbumUrl.host}${this.apiPath}`;
    this.album = sharedAlbumUrl.pathname.substring(lastSlash + 1);
    this.imageMap = {};
    this.sessionCookie = null;
    this.requestHandler = this.makeImageHandler(sharedAlbumUrl);
  }

  makeImageHandler(url) {
    return (oreq, ores) => {
      const options = {
        host: url.host,
        port: url.port,
        protocol: url.protocol,
        path: this.imageMap[oreq.url],
        method: "GET",
        headers: {
          "cache-control": "none",
          cookie: this.sessionCookie
        }
      };
      const protocol = url.protocol === "http:" ? http : https;
      const preq = protocol.request(options, pres => {
        ores.writeHead(pres.statusCode, pres.headers);
        pres.on("data", chunk => ores.write(chunk));
        pres.on("close", () => ores.end());
        pres.on("end", () => ores.end());
      }).on("error", error => {
        try {
          ores.writeHead(500);
          ores.write(error.message);
        } catch (_) {
        }
        ores.end();
      });
      preq.end();
    };
  }

  fetch() {
    this.state = "create_session";
    this.request({ url: this.sharedAlbumUrlText });
  }

  processResponse(body, response) {
    if (response.status !== 200) {
      console.error(`ERROR: ${response.status} -- ${body}`);
      return [];
    }

    if (this.state === "create_session") {
      if ("set-cookie" in response.headers) {
        this.sessionCookie = response.headers["set-cookie"][0].split(";")[0];
        this.state = "browse_item";
        this.request({
          method: "POST",
          url: this.apiUrl,
          body: `additional=["thumbnail","resolution","orientation","video_convert","video_meta"]&offset=0&limit=${this.config.maximumEntries}&passphrase="${this.album}"&api="SYNO.Photo.Browse.Item"&method="list"&version=3`,
          headers: {
            cookie: this.sessionCookie,
            "x-syno-sharing": this.album
          }
        });
      }
      return [];
    }

    return JSON.parse(body).data.list.map(item => {
      this.imageMap[`/${item.id}`] = `${this.apiPath}?id=${item.id}&cache_key=${item.additional.thumbnail.cache_key}&type="unit"&size="xl"&api="SYNO.Photo.Thumbnail"&method="get"&version=1&_sharing_id="${this.album}"&passphrase="${this.album}"`;
      return { url: item.id };
    });
  }
}

const SOURCE_TYPES = [
  ApodSource,
  BingSource,
  ChromecastSource,
  DirectUrlSource,
  FireTvSource,
  FlickrSource,
  ICloudSource,
  JsonSource,
  LightroomSource,
  LocalSource,
  MetMuseumSource,
  NasaSource,
  PexelsSource,
  RedditSource,
  SynologyMomentsSource
];

function createSource(module, config, id) {
  const source = config.source.toLowerCase();
  const SourceClass = SOURCE_TYPES.find(sourceType => sourceType.matches(source)) || BingSource;

  return new SourceClass(module, config, id);
}

module.exports = { WallpaperSource, createSource };
