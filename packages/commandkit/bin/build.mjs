// @ts-check

import { build } from 'tsup';
import { Colors, erase, findCommandKitConfig, panic, write } from './common.mjs';
import ora from 'ora';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function bootstrapProductionBuild(config) {
    const {
        sourcemap = false,
        minify = false,
        outDir = 'dist',
        antiCrash = true,
        src,
        main,
    } = await findCommandKitConfig(config);

    const status = ora('Creating optimized production build...\n').start();
    const start = performance.now();

    erase(outDir);

    try {
        await build({
            clean: true,
            format: ['esm'],
            dts: false,
            skipNodeModulesBundle: true,
            minify,
            shims: true,
            banner: {
                js: '/* Optimized production build generated by CommandKit */',
            },
            sourcemap,
            keepNames: true,
            outDir,
            silent: true,
            entry: [src, '!dist', '!.commandkit', `!${outDir}`],
        });

        await injectShims(outDir, main, antiCrash);

        status.succeed(
            Colors.green(`Build completed in ${(performance.now() - start).toFixed(2)}ms!`),
        );
        write(
            Colors.green(
                `\nRun ${Colors.magenta(`commandkit start`)} ${Colors.green('to start your bot.')}`,
            ),
        );
    } catch (e) {
        status.fail(`Build failed after ${(performance.now() - start).toFixed(2)}ms!`);
        panic(e);
    }
}

async function injectShims(outDir, main, antiCrash) {
    const path = join(process.cwd(), outDir, main);

    const antiCrashScript = antiCrash ? [
        '\n\n// --- CommandKit Anti-Crash Monitor ---',
        ';(()=>{',
        "  'use strict';",
        "  // 'uncaughtException' event is supposed to be used to perform synchronous cleanup before shutting down the process",
        '  // instead of using it as a means to resume operation.',
        '  // But it exists here due to compatibility reasons with discord bot ecosystem.',
        "  const p = (t) => `\\x1b[33m${t}\\x1b[0m`, b = '[CommandKit Anti-Crash Monitor]', l = console.log, e1 = 'uncaughtException', e2 = 'unhandledRejection';",
        '  if (!process.eventNames().includes(e1)) // skip if it is already handled',
        '    process.on(e1, (e) => {',
        '      l(p(`${b} Uncaught Exception`)); l(p(b), p(e.stack || e));',
        '    })',
        '  if (!process.eventNames().includes(e2)) // skip if it is already handled',
        '    process.on(e2, (r) => {',
        '      l(p(`${b} Unhandled promise rejection`)); l(p(`${b} ${r.stack || r}`));',
        '    });',
        '})();',
        '// --- CommandKit Anti-Crash Monitor ---\n',
    ].join('\n') : '';

    const finalScript = [antiCrashScript].join('\n');

    return appendFile(path, finalScript);
}
