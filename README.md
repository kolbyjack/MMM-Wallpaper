# Module: MMM-Wallpaper
The module allows you to add wallpapers from bing or reddit.  Useful for MagicMirror installations that aren't actually mirrors.

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
|`source`|`"bing"`|The image source to use.  Currently "bing", "firetv", and "/r/&lt;subreddit&gt;" are supported.|
|`updateInterval`|`60 * 60 * 1000`|How often (in ms) to check the source for new wallpapers.|
|`slideInterval`|`5 * 60 * 1000`|How often (in ms) to change images.|
|`maximumEntries`|`10`|The maximum number of images to switch between from the source.|
|`filter`|`"grayscale(0.5) brightness(0.5)"`|The CSS filter to apply to the images, to improve readability of other modules' text|
|`orientation`|`"auto"`|The image orientation to retrieve.  Choices are "vertical," "horizontal," and "auto."|
