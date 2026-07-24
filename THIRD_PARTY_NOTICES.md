# Third-party notices

PalHarbor depends on third-party packages distributed under their respective
licenses. The complete dependency graph is recorded in `pnpm-lock.yaml`; source
packages and their license texts are obtained from the configured package
registry during installation.

The bundled web fonts are provided by Fontsource and remain subject to the SIL
Open Font License 1.1. Leaflet is BSD-2-Clause, Lucide is ISC, Vue is MIT, and
Prisma components are Apache-2.0. These works are not relicensed by PalHarbor.

Palworld, its names, map artwork, textures, and other game content are property
of Pocketpair, Inc. PalHarbor is an unofficial fan project and is not affiliated
with, endorsed by, or sponsored by Pocketpair. Game artwork is not distributed
in this repository or the PalHarbor container.

The default runtime map URLs reference community-maintained copies in
PalworldSaveTools. PalHarbor downloads those files only while an operator runs
the application, permits both URLs to be overridden or synchronization to be
disabled, and does not claim that its MIT license applies to the downloaded
artwork. Downloaded and generated files remain outside Git under
`apps/api/data/maps`.

No dungeon-coordinate dataset is distributed. Operators may import optional
coordinates from a source they are authorized to use; normalized output remains
in the ignored versioned map-data directory.
