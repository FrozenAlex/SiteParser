// const purgecss = require('@fullhuman/postcss-purgecss')

// let postpurge = purgecss({
//         content: ['views/**/*.pug'],
//     defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
//     whitelist: []
// })


module.exports = {
        map: !(process.env.NODE_ENV === "production"),
        plugins: [
                require("postcss-import"),
                // require("tailwindcss"),
                ...(process.env.NODE_ENV === "production"
                        ? [require("postcss-preset-env"), require("cssnano")]
                        : []),
        ],
};