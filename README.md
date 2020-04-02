# Module: MMM-Wallpaper
The module allows you to add wallpapers from various online sources.  Useful for MagicMirror installations that aren't actually mirrors.

## Installation

In your terminal, go to your MagicMirror's Module folder:
````
cd ~/MagicMirror/modules
````

Clone this repository (with Chromecast functionality):
````
git clone https://github.com/TheLukaBoss/MMM-Wallpaper-WithChromecastImages.git
````

Rename the new folder to ensure module is loaded correctly:
````
Rename to: 'MMM-Wallpaper'
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
      source: "chromecast",
      slideInterval: 60 * 1000 // Change slides every minute
    }
  }
]
````

## Configuration options

The following properties can be configured:


|Option|Default|Description|
|---|---|---|
|`source`|`"bing"`|The image source to use.  Supported sources:<br/>&nbsp;- "bing": cycles through the most recent daily wallpapers from Bing<br/>&nbsp;- "firetv": cycles through random selections of the FireTV wallpapers<br/>&nbsp;- "/r/&lt;subreddit&gt;": cycles through the most recent "hot" image posts from the subreddit<br/>&nbsp;- "icloud:&lt;album id&gt;": cycles through random selections of the specified album<br/>&nbsp;- **"chromecast": added in this fork, please read this repo's description: cycles through random images listed in chromecast.json**|
|`updateInterval`|`60 * 60 * 1000`|How often (in ms) to check the source for new wallpapers.|
|`slideInterval`|`5 * 60 * 1000`|How often (in ms) to change images.|
|`maximumEntries`|`10`|The maximum number of images to switch between from the source.|
|`filter`|`"grayscale(0.5) brightness(0.5)"`|The CSS filter to apply to the images, to improve readability of other modules' text|
|`orientation`|`"auto"`|The image orientation to retrieve.  Choices are "vertical," "horizontal," and "auto."|
|`crossfade`|`true`|Whether to crossfade between images when loading a new wallpaper, or just replace the current image.|
|`maxWidth`|`MAX_SAFE_INTEGER`|Maximum width of selected variant (only supported for reddit sources).|
|`maxHeight`|`MAX_SAFE_INTEGER`|Maximum height of selected variant (only supported for reddit sources).|
