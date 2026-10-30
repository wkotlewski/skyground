# SkyGround

Copyright © 2026 Whitney Kotlewski. All rights reserved.

SkyGround is a phone-first browser page for curious students. Point your phone at the sky to find satellites, planets, the Moon, and bright stars. Tap one to learn what it does, how high and fast it orbits, and what place on Earth is below it right now.

**Open SkyGround:** [wkotlewski.github.io/skyground](https://wkotlewski.github.io/skyground/)

## Use it for

- Pointing your phone at the sky and seeing what is there, even through the ground
- Comparing low, medium, geostationary, and highly elliptical orbits with real numbers
- Following a satellite down to its ground point, or the Sun and Moon to the spot where they are straight overhead
- Reading a short introduction and history of the country or ocean below

## What you can do

Tap **Point my phone** and SkyGround asks for your location and motion sensors so the sky on screen matches where you are standing and where you aim. Your location is rounded, used only on your phone, and never saved or sent anywhere. You can pick a city instead. Everything is calculated on your device.

- **Sky** shows a real midnight star map with constellation lines and the Milky Way, plus planets, asteroids, Pluto, and famous galaxies and nebulae. It follows your phone's motion, or lets you drag to look around. Objects below your horizon are drawn faintly, "seen through Earth". Aim at something and tap **Learn**.
- **Orbits** shows 26 satellites around Earth from above the North Pole, at their real heights, with cards for LEO, MEO, GEO, and HEO.
- **Earth** shows every satellite's ground point, the day and night line, and the selected satellite's path. Tap anywhere to see what is there.
- **Explore** starts from space: pick any satellite, planet, asteroid, galaxy, or star, even below your horizon, and follow it down to Earth. Each card shows the places its path crosses next and dated events on the ground connected to it, from Stonehenge to Sputnik to the Chicxulub impact.
- Tap any place under an object, or anywhere on the map, for a place card: an introduction and history, people, work and income, education, and health figures from the World Bank, what is overhead from there right now, and a timeline that ties the place to moments where the sky and the ground met.
- Cards include a picture with its credit and licence (or a star chart or to-scale orbit diagram), and many have an official NASA or NOAA video that plays only when tapped.
- A ground point is the spot beneath a satellite. It is not where a camera is looking.
- Above the horizon does not mean visible: most satellites are only visible near dawn and dusk.

## For engineers

The public page is a static site built with Vite and TypeScript, hosted on GitHub Pages. Node 22 or newer.

```sh
npm ci
npm test
npm start
```

Calculations run in the browser. Astronomy Engine computes the Sun, Moon, and planets. satellite.js propagates the bundled CelesTrak GP snapshot, which a shared job refreshes every 6 hours. An open page checks this site every 30 minutes and picks up newer data without reloading. Asteroid orbits refresh weekly. Wikidata supplies planet sizes, satellite catalog facts, and places near the two city reference points. Wikipedia introductions and history overviews are short CC BY-SA excerpts, matched to Natural Earth country and ocean outlines by Wikidata ID. A NASA GIBS Blue Marble image from 2004-08-01 sits under Natural Earth land. NASA image and news records are stored and stay hidden until a grade review. The sky view is a pinhole-camera projection of the calculated directions; the orbit diagram and world map use the same records as the list. Orbitron is the heading type. Those tools keep their own licenses. Asteroid orbits come from NASA JPL's Small-Body Database, and the star map from d3-celestial (BSD-3) built on the HYG database (CC BY-SA). Pictures are freely licensed Wikipedia lead images and NASA Image Library photos, resized and served from this site. This page does not request CelesTrak, Wikidata, Wikipedia, JPL, or NASA when someone opens it. YouTube (youtube-nocookie.com) is contacted only after someone taps Play on a video.

The rest of the product design stays with the SkyGround team.

## Copyright

The SkyGround name, interface, and product are owned by Whitney Kotlewski. Looking at this repository or using the public page does not grant any right to copy, reproduce, modify, distribute, or build from the SkyGround idea or interface.

All rights reserved.
