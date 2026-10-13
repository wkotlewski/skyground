# SkyGround

Copyright © 2026 Whitney Kotlewski. All rights reserved.

SkyGround is a browser page for curious students. You pick a city and a time, see calculated directions in the sky, and look at a small set of places on Earth.

**Open SkyGround:** [wkotlewski.github.io/skyground](https://wkotlewski.github.io/skyground/)

## Use it for

- Seeing where the Sun, Moon, and planets are from Los Angeles or Washington, DC
- Following a few Earth satellites from a reviewed snapshot
- Comparing a place near the city with the ground point beneath a satellite
- Reading the same sky as a list, a horizon chart, or a 3D view

## What you can do

Choose a city, a selected time, and an interest. Sky directions are calculated on this device. Satellite positions use a snapshot stored with this page. The page does not ask for your location.

- **Sky** shows azimuth and elevation. North is up. Above the horizon is a geometric angle.
- **Earth** lists curated places near the city, or near a satellite’s ground point.
- **3D sky** uses the same directions. Marker size is not distance or brightness.
- A satellite ground point is the place beneath the satellite. It is not a camera footprint.
- Planets and the Moon stay connected to the city. They do not get a satellite ground point.

Place coordinates are examples for those two cities.

## For engineers

The public page is a static site built with Vite and TypeScript, hosted on GitHub Pages. Node 22 or newer.

```sh
npm ci
npm test
npm start
```

Calculations run in the browser. Astronomy Engine computes the Sun, Moon, and planets. satellite.js propagates the bundled CelesTrak GP snapshot. Three.js draws the optional 3D sky. Orbitron is the heading type. Those tools keep their own licenses. This page does not request CelesTrak when someone opens it.

The rest of the product design stays with the SkyGround team.

## Copyright

The SkyGround name, interface, and product are owned by Whitney Kotlewski. Looking at this repository or using the public page does not grant any right to copy, reproduce, modify, distribute, or build from the SkyGround idea or interface.

All rights reserved.
