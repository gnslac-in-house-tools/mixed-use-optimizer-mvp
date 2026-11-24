# GFit's published terrains

Every `.gfs` file in this folder is one of **GFit's terrains** (Decision *Home libraries*, Phase HL): it ships with the
app, so everyone who opens the public link finds it in Home's *Terrain* and in *Create new*'s list of terrains, beside
the two that come with GFit: the sample's site (*Industrial park*) and *Quezaltepeque, El Salvador* (the starter
project's survey).

A terrain is a site without its rules (the rules are a project type's): its boundary, gates and existing
roads, where it is on the map, its ground (contours and points) and the frame of the file it came from.

To publish a terrain for the team:

1. In Home › Terrain, press **Upload…** and give it the survey (DXF, DWG, a CSV of points, KML, GeoJSON, a zipped
   Shapefile): it opens in the terrain editor, the site import. Pick the boundary and the layers, *Import*,
   name it, **Save to library**, **Close**.
2. On its card press **.gfs** — the file downloads.
3. Put the file here (`src/state/terrains/<name>.gfs`), on a branch, and open a PR to `main`.
4. Once merged, the public link has it.

To update a published terrain, save it at a higher `version` (edit the number in the file) and replace its file here.
A file of the same id as one of GFit's own, at a higher version, takes its place.

**The file's shape** (`format: "gfit-terrain"`, `formatVersion: 1`, `LibraryTerrainSchema` in `src/model/schema.ts`):
an id, a name, a version, when it was saved, and the site without its `rules`. The card's **DXF** is for CAD, not for
uploading back: the boundary (`GFIT-BOUNDARY`), the contours at their heights (`GFIT-CONTOURS`) and the points
(`GFIT-POINTS`), in the units and coordinates of the file the site came from.
