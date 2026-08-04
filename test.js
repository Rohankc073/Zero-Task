const path = require('path');
const config = require('tailwindcss/loadConfig')(path.join(__dirname, 'tailwind.config.js'));

const flattenPresets = (configs = []) => {
    if (!configs)
        return [];
    return configs.flatMap((config) => [
        config,
        ...flattenPresets(config.presets),
    ]);
};

console.log(config.presets);
const hasPreset = flattenPresets(config.presets).some((preset) => {
    return preset && preset.nativewind;
});

console.log('hasPreset:', hasPreset);
