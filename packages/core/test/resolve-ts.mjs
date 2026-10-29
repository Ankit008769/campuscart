// Loaded with `node --import` for the unit tests. Source files import their siblings without an
// extension ('./money'), which Metro, Next.js and TypeScript expect; Node's own loader needs the
// '.ts', so this hook adds it for relative imports that have no extension.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Not a .ts sibling: fall through to the normal resolution and its error.
      }
    }
    return nextResolve(specifier, context);
  },
});
