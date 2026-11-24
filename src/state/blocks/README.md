# GFit's published blocks

Every `.gfb` file in this folder is one of **GFit's blocks** (Decision *Block library*, Phase BL.5): it ships with
the app, so everyone who opens the public link finds it in Home's *Blocks* and in every project's Blocks panel, beside
the sample's Cross-dock and Rear-load.

To publish a block for the team:

1. In Home › Blocks (or after *Save to library* in a project), press the block's **.gfb** — the file downloads.
2. Put the file here (`src/state/blocks/<name>.gfb`), on a branch, and open a PR to `main`.
3. Once merged, the public link has it. Projects linked to it take a newer version when they open.

To update a published block, download it again at a higher version (save it with *Overwrite* first) and replace its
file here. A file of the same id as a sample block, at a higher version, takes the sample block's place.

**The file's shape** (`formatVersion`, Decision *Block shape*): GFit writes **5**, a block as one mass, its type's
shape an outline in metres (Phase D.2: its corners in the type's frame, its bumps and notches part of it, its edges
named), its holes as contours, its zones inside it and its elements by edge. A file without `formatVersion` (1, before Phase BS: a hall with parts and elements by side) is still
read, here and by *Upload…*, into the new shape (`migrateBlock` in `modules/warehouse/engine/migrate.ts`): its bumps
joined to the outline on the hall's program, its elements on the edges that were the hall's walls. Download it again to
keep it as a 5.
