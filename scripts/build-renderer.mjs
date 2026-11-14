// Build renderer: precompile .vue SFCs and copy the Vue runtime.
// Run before start, preview, test, check and package.
// Output goes to src/generated/ (gitignored).
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parse, compileScript, compileTemplate} from '@vue/compiler-sfc';

const root = path.resolve('.');
const outDir = path.join(root, 'src/generated');
await fs.mkdir(outDir, {recursive: true});

// 1. Copy the runtime-only browser build + license
const require = createRequire(import.meta.url);
const vueRoot = path.dirname(require.resolve('vue/package.json'));
const vueDist = path.join(vueRoot, 'dist');
await fs.copyFile(path.join(vueDist, 'vue.runtime.esm-browser.prod.js'), path.join(outDir, 'vue.runtime.mjs'));
await fs.copyFile(path.join(vueRoot, 'LICENSE'), path.join(outDir, 'vue-LICENSE.txt'));

// 2. Compile each .vue SFC
const sfcDir = path.join(root, 'src/vue');
const entries = (await fs.readdir(sfcDir)).filter(f => f.endsWith('.vue')).sort();
for (const entry of entries) {
  const source = await fs.readFile(path.join(sfcDir, entry), 'utf8');
  const id = entry.replace('.vue', '');
  const {descriptor, errors} = parse(source, {filename: entry});
  if (errors.length) throw new AggregateError(errors, `SFC parse error in ${entry}`);
  if (descriptor.styles.length || descriptor.customBlocks.length) throw Error(`${entry}: keep styles in the existing CSS files`);

  const inlineTemplate = !!descriptor.scriptSetup;
  const scriptResult = compileScript(descriptor, {id, inlineTemplate, genDefaultAs: '_component', isProd: true, sourceMap: false});
  let code = scriptResult.content;
  if (!inlineTemplate && descriptor.template) {
    const tpl = compileTemplate({source: descriptor.template.content, filename: entry, id, isProd: true, transformAssetUrls: false, compilerOptions: {mode: 'module', bindingMetadata: scriptResult.bindings}});
    if (tpl.errors.length) throw new AggregateError(tpl.errors, `Template compile error in ${entry}`);
    code = `${tpl.code}\n${code}\n_component.render = render;\n`;
  }
  code = code.replace(/from ['"]vue['"]/g, "from './vue.runtime.mjs'") + '\nexport default _component;\n';
  await fs.writeFile(path.join(outDir, `${id}.mjs`), code);
  console.log(`  compiled ${entry} → src/generated/${id}.mjs`);
}
console.log(`Vue renderer build: ${entries.length} SFC(s), runtime copied.`);
