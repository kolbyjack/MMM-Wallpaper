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
|`updateInterval`|`60 * 60 * 1000`|How often (in ms) to check the source for new wallpapers.|
|`slideInterval`|`5 * 60 * 1000`|How often (in ms) to change images.|
|`maximumEntries`|`10`|The maximum number of images to load from the source.|
|`filter`|`"grayscale(0.5) brightness(0.5)"`|The CSS filter to apply to the images, to improve readability of other modules' text|
|`orientation`|`"auto"`|The image orientation to retrieve.  Choices are "vertical," "horizontal," and "auto."|
|`crossfade`|`true`|Whether to crossfade between images when loading a new wallpaper, or just replace the current image.|
|`maxWidth`|`MAX_SAFE_INTEGER`|Maximum width of selected variant (only supported for reddit sources).|
|`maxHeight`|`MAX_SAFE_INTEGER`|Maximum height of selected variant (only supported for reddit sources).|
|`nsfw`|`true`|Whether to allow 18+ images to be chosen (only supported for reddit sources).|
|`size`|`cover`|Sizing policy for images.  Similar to CSS [background-size](https://www.w3schools.com/cssref/css3_pr_background-size.asp).  Choices are "cover," "contain," and "auto."|

|Source|Description|
|---|---|
|`"bing"`|Cycles through the most recent daily wallpapers from Bing.|
|`"chromecast"`|Cycles through random selections of the Chromecast wallpapers (thanks TheLukaBoss).|
|`"firetv"`|Cycles through random selections of the FireTV wallpapers.|
|`"flickr-group:<id>"`|Cycles through random selections of the specified flickr group's photos.|
|`"flickr-user:<id>"`|Cycles through random selections of specified flickr user's photos.|
|`"flickr-user-faves:<id>"`|Cycles through random selections of specified flickr user's favorite photos.|
|`"http(s)://url"`|Reloads the specified url at the configured interval.|
|`"icloud:<album id>"`|Cycles through random selections of the specified album.|
|`"lightroom:<user.myportfolio.com/album>"`|Cycles through random selections of the specified album.|
|`"/r/<subreddit>"`|Cycles through the most recent `hot` image posts from the subreddit.|
|`"/user/<username>/m/<subreddit>"`|Cycles through the most recent `hot` image posts from the your multireddit.|