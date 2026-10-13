# SkyGround

Copyright © 2026 Whitney Kotlewski. All rights reserved.

SkyGround is a browser page for curious students. You pick a city and a time, see calculated directions in the sky, and look at a small set of places on Earth.

**Open SkyGround:** [wkotlewski.github.io/skyground](https://wkotlewski.github.io/skyground/)

## Use it for

- Searching or browsing the calculated sky and a small set of places
- Choosing a city, then a satellite, the Sun, the Moon, or a planet
- Comparing a place near that city with the ground point beneath a satellite
- Reading the same records as a scene or a list

## What you can do

Choose a city, a selected time, and an interest. Sky directions are calculated on this device. Satellite positions use a snapshot stored with this page. The page does not ask for your location.

- **Sky** shows azimuth and elevation for the selected time. Above the horizon is a geometric angle. The scene and the list use the same objects.
- **Earth** shows Natural Earth land and curated places near the chosen city, inside a chosen area, or near a satellite’s ground point.
- A satellite ground point is the place beneath the satellite. It is not a camera footprint.
- Planets, the Sun, and the Moon stay on a learning topic. They do not get a satellite ground point.
- Media, history, and news stay hidden until a reviewed source is available.

Place coordinates are examples for those two cities.

## For engineers

The public page is a static site built with Vite and TypeScript, hosted on GitHub Pages. Node 22 or newer.

```sh
npm ci
npm test
npm start
```

Calculations run in the browser. Astronomy Engine computes the Sun, Moon, and planets. satellite.js propagates the bundled CelesTrak GP snapshot. Wikidata sizes are a reviewed snapshot. Natural Earth supplies the land outlines. The scene is a horizon chart and a world overview, and the list has the same records. Orbitron is the heading type. Those tools keep their own licenses. This page does not request CelesTrak, Wikidata, or Natural Earth when someone opens it.

The rest of the product design stays with the SkyGround team.

## Copyright

The SkyGround name, interface, and product are owned by Whitney Kotlewski. Looking at this repository or using the public page does not grant any right to copy, reproduce, modify, distribute, or build from the SkyGround idea or interface.

All rights reserved.
