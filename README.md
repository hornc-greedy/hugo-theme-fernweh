# Fernweh

A travel journal for Hugo. One page bundle per day, its photographs as a
justified album, a lightbox without dependencies, and a map cut to the shape of
the country, drawn from the coordinates the cameras wrote into the pictures.

[![Hugo](https://img.shields.io/badge/Hugo-0.155.3%2B-FF4088?logo=hugo&logoColor=white)](https://gohugo.io)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](https://github.com/hornc-greedy/hugo-theme-fernweh/blob/main/LICENSE)
![Dependencies](https://img.shields.io/badge/dependencies-none-31C653)

![An entry with its album](https://raw.githubusercontent.com/hornc-greedy/hugo-theme-fernweh/main/images/screenshot.png)

| | |
| --- | --- |
| **Example site** | [`exampleSite/`](https://github.com/hornc-greedy/hugo-theme-fernweh/tree/main/exampleSite), two journeys, two days each, English and German |
| **Needs** | Hugo 0.155.3 or newer, for the metadata a photo carries |
| **Licence** | MIT, and the bundled work under [its own terms](#licences) |

---

## Features

- **A day is a page bundle**. Drop the photographs beside the entry, nothing else
- **A justified album**, laid out at build time from the aspect ratios
- **Sorted by capture time**, placed on the map by the coordinates in the files
- **A lightbox of its own**, keyboard and screen reader included
- **A map per country** a journey touches, cut to its outline
- **Two languages or one**, every word of the interface in `i18n/`
- **Light and dark**, an accent colour to pick, a page tinted by its own picture
- **Nothing fetched at run time**, no CDN, no tracker, no build step of your own

---

## Quick start

```sh
git clone https://github.com/hornc-greedy/hugo-theme-fernweh themes/fernweh
hugo server --source themes/fernweh/exampleSite --themesDir ../..
```

That serves the example site: two journeys of two days each, in English and
German. The photographs are public domain and carry the coordinates the maps are
drawn from.

## Installation

As a **Hugo module**, the theme carries a `go.mod`:

```yaml
module:
  imports:
    - path: github.com/hornc-greedy/hugo-theme-fernweh
```

As a **git submodule**, pinned to a commit you choose:

```sh
git submodule add https://github.com/hornc-greedy/hugo-theme-fernweh themes/fernweh
```

Or **copied in**: put this repository in `themes/fernweh`.

The last two want `theme: fernweh` in your configuration; the module import says
it already. Two more lines belong there whichever way you went, because a theme
may not set them for you:

```yaml
# the map is drawn from the coordinates in the photos, and Hugo leaves GPS out
# of the metadata it extracts unless it is asked for
imaging:
  meta:
    fields: ['GPS*', 'Date*']

# a journey needs its map data beside its page
outputs:
  home: [HTML]
  page: [HTML]
  section: [HTML, geojson]
```

Everything else the theme brings along and you may override: see
`exampleSite/hugo.toml` for a site that works, and the `[params]` block in the
theme's own `hugo.toml` for what can be changed.

## Content

One folder per journey, one leaf bundle per day, the photographs beside the
entry that shows them:

```
content/
├── _index.md
└── my-journey/
    ├── _index.md            the journey
    └── first-day/
        ├── index.md         the report
        ├── photo-1.jpg
        └── photo-2.jpg
```

```sh
hugo new content --kind journey my-journey/_index.md
hugo new content --kind day my-journey/first-day
```

Nothing else is needed: Hugo cuts the sizes, reads the moment and the place out
of every file, sorts the album by capture time and puts each located picture on
the map. What the front matter may add:

| Key | On | What it does |
| --- | --- | --- |
| `title` | journey, day | |
| `date` | journey, day | the day it happened; sets the order |
| `until` | journey | its last day, where the entries should not settle it |
| `cover` | day | which photograph opens the entry; the first one otherwise |
| `photos` | day | a line under a picture: `- image: photo-1.jpg` with a `caption` |
| `description` | any | the meta description, and the text a shared link carries |
| `layout` | any | `plain` for a page that is neither journey nor day, an about page or a privacy notice |

## Configuration

Everything below is a default the theme brings; a value of your own wins.

| Param | Default | What it does |
| --- | --- | --- |
| `accent` | `gold` | `gold`, `pink` or `teal` |
| `column` | `1280px` | width of the one column everything sits in |
| `cover` | `200px` | edge of the square cover on the front page |
| `map.width` | `500px` | width of the map column; the outline derives its height |
| `map.pin` | `50` | thumbnail on the map, in the overview and at full zoom |
| `map.pinmax` | `100` | its largest, at the zoom levels in between |
| `map.maxzoom` | `18` | how far the map lets you zoom in |
| `map.tiles` | OpenStreetMap | the tile source under the outlines |
| `map.overlay` | | a second tile layer over the first, labels for instance |
| `map.darken` | `true` | pull light tiles into the dark palette with a CSS filter |
| `photos.origin`, `photos.sizes` | empty | take the pictures from a bucket instead |

Two more places carry texts rather than values:

- **`i18n/de.toml`, `i18n/en.toml`** hold every word the interface says, including
  the map credit under `map_attribution`. Another language wants a table of its
  own beside them; a missing key falls back to the default language.
- **`data/site.yaml`** holds the name in the header, per language. A file of your own
  replaces the theme's whole, so write down every language you serve:

  ```yaml
  en:
    name: Travel journal
    kicker: ""
  fr:
    name: Carnet de voyage
    kicker: ""
  ```

Headings are set in **Sora**, two weights of latin-subset `woff2` under
`static/fonts/`, about 32 KB and no font service. Swap the files and the
`@font-face` rules in `layouts/_partials/head.html`; everything else follows
`--font-display`.

## Map

![The map of a journey](https://raw.githubusercontent.com/hornc-greedy/hugo-theme-fernweh/main/images/map.png)

- **One map per country a journey touches**, cut to the outline, the photographs
  on their own coordinates. Which countries those are is worked out from the
  pictures. Corsica gives you the island, not the whole of France.
- **Nothing about it is configured.** No country list, no ISO code, no bounding
  box in the front matter.
- **The outlines are Natural Earth at 1:50 million**, and none of that reaches
  the visitor: the build writes only the countries the photos are in.
- **A finer file wins over the theme's.** It brings the tool that cut its own,
  and it needs nothing but a Node that runs TypeScript from source, 24 or newer:

  ```sh
  node themes/fernweh/geo/fetch.ts 10 assets/geo/countries.json
  ```

- **A photo without coordinates is left off**, which is what happens to anything
  routed through a photo service or a messenger.

## Photographs from a bucket

Page bundles put every original into your repository. If you would rather keep
them on S3, R2, a storage box or any static host, name the two addresses and the
theme takes the pictures from there instead:

```yaml
params:
  photos:
    origin: "https://example.com/photos"   # the originals an entry names
    sizes: "https://example.com/sizes"     # the cut sizes, beside their note
```

An entry then lists its pictures by address:

```yaml
photos:
  - image: https://example.com/photos/2025/first-day-1.webp
    caption: A line for this one
```

For each of them the theme looks under `sizes` for five files, named after the
address without its `.webp`:

| File | What for |
| --- | --- |
| `<key>-560.webp` | the album, and the row on a journey |
| `<key>-1120.webp` | wider screens, through `srcset` |
| `<key>-128.webp` | the thumbnail on the map |
| `<key>-440.webp` | that thumbnail, zoomed in |
| `<key>.json` | `{"w":1600,"h":900,"date":"2026-06-13T11:23:45","lat":47.8,"lon":12.4}` |

The note is all a build reads: the order of the album, the aspect ratios, the
`srcset` and the pins. No picture is fetched, and the bucket is never listed.
The theme shows what an entry names, nothing else.

**You bring the uploader.** Cutting those four sizes and writing the note is a
short script over your own storage; the theme ships none, because what it would
have to talk to differs with every host.

## Contributing

Issues and pull requests are welcome. Before you open one, build the example site
the way the quick start does. It exercises every template the theme has, and it
must come out without a single warning:

```sh
hugo --source exampleSite --themesDir ../.. --theme hugo-theme-fernweh
```

## Licences

The theme is MIT. It ships three pieces of other people's work:

- **Leaflet 1.9.4** under `static/leaflet/`, BSD 2-Clause, © Volodymyr Agafonkin
  and CloudMade, see `static/leaflet/LICENSE`.
- **Sora** under `static/fonts/`, SIL Open Font License 1.1, © The Sora Project
  Authors, see `static/fonts/LICENSE-sora`.
- The **example photographs** under `exampleSite/`, CC0 from [Wikimedia
  Commons](https://commons.wikimedia.org/wiki/Category:CC-Zero), public domain,
  no attribution asked of you.

Leaflet and the font are copied in, not installed: no package manager, no
lockfile, nothing to run before a build. Updating Leaflet:

```sh
curl -sSLo static/leaflet/leaflet.js  https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
curl -sSLo static/leaflet/leaflet.css https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
```

The marker images under `static/leaflet/images/` come from the same archive and
want the same version.
