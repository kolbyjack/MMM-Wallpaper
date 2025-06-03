# Module: MMM-Wallpaper
The module allows you to add wallpapers from various online sources.  Useful for MagicMirror installations that aren't actually mirrors.

## Installation

In your terminal, go to your MagicMirror's Module folder:
````
cd ~/MagicMirror/modules
````

Clone this repository:
````
git clone https://github.com/kolbyjack/MMM-Wallpaper.git
````

Install the module dependencies:
````
cd MMM-Wallpaper
npm install
````

Configure the module in your `config.js` file.

**Note:** After starting the Mirror, it will take a few seconds before the wallpapers start to appear.

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:
````javascript
modules: [
  {
    module: "MMM-Wallpaper",
    position: "fullscreen_below",
    config: { // See "Configuration options" for more information.
      source: "bing",
      slideInterval: 60 * 1000 // Change slides every minute
    }
  }
]
````

## Configuration options

The following properties can be configured:

|Option|Default|Description|
|---|---|---|
|`source`|`"bing"`|The image source to use.  See table below for supported sources.|
|`caption`|`true`|Whether to display the image caption/attribution when available.|
|`fadeEdges`|`false`|Whether to fade the top and bottom 10% of the image.|
|`updateInterval`|`60 * 60 * 1000`|How often (in ms) to check the source for new wallpapers.|
|`slideInterval`|`5 * 60 * 1000`|How often (in ms) to change images.|
|`maximumEntries`|`10`|The maximum number of images to load from the source.|
|`filter`|`"grayscale(0.5) brightness(0.5)"`|The CSS filter to apply to the images, to improve readability of other modules' text|
|`orientation`|`"auto"`|The image orientation to retrieve.  Choices are "vertical," "horizontal," and "auto."  Only used by the `pexels` and `bing` sources.|
|`crossfade`|`true`|Whether to crossfade between images when loading a new wallpaper, or just replace the current image.|
|`maxWidth`|`MAX_SAFE_INTEGER`|Maximum width of selected variant (only supported for reddit & flickr sources).|
|`maxHeight`|`MAX_SAFE_INTEGER`|Maximum height of selected variant (only supported for reddit & flickr sources).|
|`nsfw`|`true`|Whether to allow 18+ images to be chosen (only supported for reddit sources).|
|`shuffle`|`true`|Whether to randomly select images from those sources that support it, or cycle through the latest.|
|`size`|`cover`|Sizing policy for images.  Similar to CSS [background-size](https://www.w3schools.com/cssref/css3_pr_background-size.asp).  Choices are "cover," "contain," and "auto."|
|`userPresenceAction`|`"none"`|What action to take when a `USER_PRESENCE` notification is received.  Choices are "none," "show," and "hide."|
|`fillRegion`|`true`|Whether to fill the region where the module is positioned, or to add a div in the normal flow of the page.  When set to `false`, the `width` and `height` properties may be set to restrict the size of the module.|
|`width`|`"auto"`|Width of the content when `fillRegion` is `false`.|
|`height`|`"auto"`|Height of the content when `fillRegion` is `false`.|

|Source|Description|
|---|---|
|`"apod"`|Cycles through the most recent daily wallpapers from NASA's Astronomy Picture of the Day (standard resolution).|
|`"apodhd"`|Cycles through the most recent daily wallpapers from NASA's Astronomy Picture of the Day (high resolution).|
|`"bing"`|Cycles through the most recent daily wallpapers from Bing.|
|`"chromecast"`|Cycles through random selections of the Chromecast wallpapers (thanks TheLukaBoss).|
|`"firetv"`|Cycles through random selections of the FireTV wallpapers.|
|`"unsplash"`|Cycles through random selections of unsplash.|
|`"flickr-api:<source>"`|Cycles through random selections of the specified flickr photos.  See below for details.|
|`"http(s)://url"`|Reloads the specified url at the configured interval.|
|`"icloud:<album id>"`|Cycles through random selections of the specified album.|
|`"lightroom:<user.myportfolio.com/album>"`|Cycles through random selections of the specified album.|
|`"local:</path/to/directory>"`|Cycles through random selections of the images in the specified local directory.|
|`"synology-moments:<url>"`|Cycles through the latest images from the specified Synology moments album.|
|`"/r/<subreddit>"`|Cycles through the most recent `hot` image posts from the subreddit.|
|`"/user/<username>/m/<subreddit>"`|Cycles through the most recent `hot` image posts from the specified multireddit.|
|`"metmuseum:<departmentID>,<isHightlight>,<q>"`|Cycle through collections in the Metropolitan Museum of Art. [departmentID](https://collectionapi.metmuseum.org/public/collection/v1/departments) is a number specifying collection type, e.g., Asian art, paintings etc. `<isHightlight>` is a `boolean` to show only highlighted artwork if set to `true`. `<q>` is keyword, e.g. artist name, culture, etc. All fields can be set to the wildcard `*`. For example, `"metmuseum:11,true,*"` would display highlighted European paintings.|
|`"nasa:<search term>"`|Cycles through images specified in `search term` of NASA's Image and Video Library (https://api.nasa.gov/).|

Source-specific configuration items:

apod / apodhd:

|Option|Default|Description|
|---|---|---|
|`"nasaApiKey"`|`none`|Sign up for an [api key](https://api.nasa.gov/) and enter it here. (Required)|

unsplash:

|Option|Default|Description|
|---|---|---|
|`"unsplashAccessKey"`|`none`|Sign up for an [api key](https://unsplash.com/developers/) and enter it here. (Required)|
|`"query"`|`none`|Limit selection to photos matching a search term. use an array for random query params.|

Note: You can’t use the collections or topics filtering with query parameters in the same request



flickr-api:

|Option|Default|Description|
|---|---|---|
|`"flickrApiKey"`|`none`|Sign up for an [api key](https://www.flickr.com/services/apps/create/noncommercial/) and enter it here. (Required)|
|`"flickrDataCacheTime"`| `24*60*60*3600` (1 day) | How long to cache image metadata retrieved from Flickr. |
|`"flickrResultsPerPage"`| `500` | How many photo results per page to request from the Flickr API. |

*Notes:*
* You can specify multiple Flickr sources separated by `;`. For example: `flickr-api:publicPhotos;photos/<user1>/favorites;photos/<user2>/favorites`
  * If `shuffle` is `true`, up to `maximumEntries` will be listed from each source, then shuffled and no more than `maximumEntries` presented.
  * If `shuffle` is `false`, up to `maximumEntries` photos will be presented from the sources in order.
* Flickr limits usage by a single API key to 3600 queries per hour. If you set a very high `maximumEntries` you may run into this limit. This module makes the following Flickr API calls every `updateInterval`:
  * At least 1 call to `getPublicPhotos` per configured source (each call returns up to 500 photos; if there are more, and you've set `maximumEntries` higher, there will be further calls)
  * 1 call to `getSizes` per photo selected for display (at most `maximumEntries`); the results are cached for `flickrDataCacheTime`.
* Very large images can consume excessive memory on the client. To prevent this, tune `maxWidth` and `maxHeight` to suit your display setup.
  * It is important to not set the limits too low! Photos with unusual aspect ratios can lead to a poor experience. We suggest about 1.5x your display resolution as a good starting point.

|Source|Description|
|---|---|
|`publicPhotos`|Loads unfiltered public content.|
|`tags/<tags>/<tagmode>`|Load public content matching the specified comma-separated tags.  `tagmode` can be `all` or `any` (default `all`).|
|`photos/<username>`|Load public images from the user's photostream.|
|`photos/<username>/galleries/<gallery id>`|Load public images from the user's specified gallery.|
|`photos/<username>/favorites`|Load public images from the user's favorites.|
|`photos/<username>/albums/<album id>`|Load public images from the user's specified album.
|`groups/<groupname>`|Load public images from the group's pool.|

http:// or https:// url:

|Option|Default|Description|
|---|---|---|
|`"addCacheBuster"`|`true`|Whether to add a cache-busting argument to the query string (`mmm-wallpaper-ts`).|

local:

|Option|Default|Description|
|---|---|---|
|`"recurseLocalDirectories"`|`false`|Whether to recurse into subdirectories when looking for images.|

## Notifications

MMM-Wallpaper can react to the following notifications sent by other modules:

|Notification|Payload|Description|
|---|---|---|
|`LOAD_NEXT_WALLPAPER`|`none`|Will load the next wallpaper from the configured source.|
|`UPDATE_WALLPAPER_CONFIG`|`string` or `object`|If the payload is a string, the module will use it as the new source to begin loading wallpapers.  If the payload is an object, the module will update its configuration with the object's properties.  In either case, a new wallpaper will immediately be loaded and the update timer will be reset.|
|`USER_PRESENCE`|`bool`|Will take the appropriate action to hide or show itself based on the value of the payload and the configured `userPresnseAction`.|
