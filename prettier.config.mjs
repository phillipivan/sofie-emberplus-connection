import preset from '@sofie-automation/code-standard-preset/prettier.config.mjs'

// The preset passes its import-sorting plugin as an imported object, which prettier can only load when that plugin's
// optional Ember and Oxc parsers are installed. Naming the plugin lets prettier load it itself.
export default { ...preset, plugins: ['@ianvs/prettier-plugin-sort-imports'] }
