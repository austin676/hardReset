# Placeholder Assets

The game currently generates all textures **programmatically** at runtime,
so it works without any PNG files in this folder.

When you're ready to upgrade the visuals, drop your files here:

```
assets/
  tiles/
    tileset.png    — tileset image (each tile 16×16, arranged in a row)
  sprites/
    player.png     — 4×4 spritesheet (4 cols = frames, 4 rows = down/left/right/up)
    station.png    — 16×16 icon for task stations
```

The PreloadScene will automatically pick up these files when they exist.
