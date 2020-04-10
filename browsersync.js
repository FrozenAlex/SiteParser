var compress = require("compression");
var browserSync = require("browser-sync");
browserSync({
	watch: true,
	watchOptions: {},
	port: 3001,
	proxy: "localhost:3000",
	files: ["views/**/*", "public/**/*"],
	middleware: [compress()],
});
