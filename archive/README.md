# Card catalog archive

- `card-database/legacy-card-database.txt` is the retired text catalog.
- `card-art/legacy-starters/` holds the retired starter sprites; these files
  are outside the public asset directory.
- The old starter definitions, owned instances, discoveries, and deck slots
  were copied into `archived_legacy_starter_*` tables by migration 062.

The active starter catalog is defined in `server/src/inventory/starterCards.ts`.
