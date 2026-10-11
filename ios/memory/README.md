# BO1 Mobile 0.2: commit memory on use

The supplied iOS Jetsam reports show WebContent processes terminated at approximately
2 GiB (`per-process-limit`). They identify Safari processes; they do not identify
the exact BO1 WKWebView termination. This patch addresses independently verified
eager writes in the shipped engine. It is not a complete native engine port.

The web port's C++ layer is not published. The patch is a reproducible modification
of the existing WebAssembly binary, guarded by the full original and result SHA-256.
It does not change memory limits, imports, exports, game data, renderer or thread ABI.

Changes to three functions:

1. `VirtualAlloc`: initial zero-fill is conditional on `MEM_COMMIT`. `MEM_RESERVE`
   no longer writes every byte. The existing commit path already zeroes newly
   committed pages and preserves pages already committed.
2. Both emitted copies of `PMem_Init`: reserve the original 328 MiB arena, or the
   original 584 MiB mod arena, without committing it all immediately.
3. `_PMem_AllocNamed`: save the requested size in a new local, commit the requested
   range and return the original aligned pointer. Both the upward and downward
   allocation paths are preserved. Committing a shared page does not erase an
   earlier allocation on that page.

The result is 23 bytes larger. Section and function lengths are regenerated. All
other sections and functions remain byte-for-byte unchanged.

The iOS application installs `MemoryPatch.js` at document start. The fetch wrapper
only handles the engine URL on bo1.znoam.eu. Original and result hashes are checked;
unknown binaries are rejected. An already patched binary is accepted unchanged.
The compiled module is then shared with the engine workers through its normal path.
The server's files and stored game data are not rewritten by the app.

## Reproduction

```
python3 ios/scripts/build_memory_patch.py
node --test ios/tests/diagnostics.test.cjs ios/tests/memory.test.cjs
```

`--engine PATH` accepts an existing pinned binary instead of downloading it.
Temporary test binaries export allocator functions; production binaries do not.
The tests run the actual allocators under Node, with platform imports stubbed.
This is not a graphics, gameplay or physical-iPhone test.

Observed Linux/Node 24 component measurements, 2026-10-11:

| Operation | Original RSS increase | Patched RSS increase |
| --- | ---: | ---: |
| Reserve 128 MiB, no commit | 134,479,872 bytes | 393,216 bytes |
| Initialize 328 MiB PMem arena | 344,719,360 bytes | 786,432 bytes |

These measure initialization only. The game will commit memory as it uses the arena;
they do not establish a 328 MiB reduction in the final game's peak footprint.

Tests cover zero-on-commit, repeated commits, decommit/recommit, direct commitment,
both PMem initialization paths, 160 low/high allocations per path, alignment and
preservation of previous writes, digest validation, unknown-build rejection,
idempotency, unrelated fetches and unchanged module ABI.

The diagnostic report retains the patch status and the last 24 samples of bounded
engine allocation counters separately from console spam. These counters do not
measure the iOS WebContent resident footprint. No heap walking or heap serialization
is performed. Physical iPhone loading and sustained gameplay remain unverified.
