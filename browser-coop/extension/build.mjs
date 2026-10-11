// Native ES module for the existing site; the network pump remains a separate Blob worker.
// The small site/bo1z/coop-config.js stays external and can be configured without rebuilding.
import { build } from "esbuild";

const dir = new URL(".", import.meta.url).pathname;
const version = 'znoam-20261011-2';

const pump = await build({
  entryPoints: [`${dir}src/pump-worker.js`],
  bundle: true,
  format: "iife",
  target: ["chrome120", "safari18"],
  write: false,
  minify: false,
  legalComments: "none",
});

await build({
  entryPoints: [`${dir}src/main.js`],
  bundle: true,
  format: "esm",
  target: ["chrome120", "safari18"],
  outfile: `${dir}../site/bo1z/coop.validated-20261011-1.js`,
  external: ["./coop-config.js"],
  legalComments: "none",
  banner: { js: `// BO1 Znoam ${version}. Adapted from invictus841/bo1-zombies-decompiled @ 861e39bc.` },
  define: {
    __PUMP_SOURCE__: JSON.stringify(pump.outputFiles[0].text),
    __VERSION__: JSON.stringify(version),
  },
});
console.log(`built site/bo1z/coop.validated-20261011-1.js (${version})`);
