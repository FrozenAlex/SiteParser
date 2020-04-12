const { DefinePlugin } = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

const path = require("path");

module.exports = (env) => {
	const production = process.env.NODE_ENV === "production" ? true : false;

	return {
		mode: production ? "production" : "development",
		entry: `./client/index.ts`,
		output: {
			path: path.resolve(__dirname, "public"),
			filename: "main.js",
			sourceMapFilename: production ? undefined : "[name].js.map",
			publicPath: "/",
		},
		devtool: production ? "none" : "source-map",
		module: {
			rules: [
                {
                    // Include ts, tsx, js, and jsx files.
                    test: /\.(ts|js)x?$/,
                    exclude: /node_modules/,
                    loader: 'babel-loader',
                },
				{
					test: /\.(css)$/,
					use: [
						MiniCssExtractPlugin.loader, //one CSS file for every js file
						"css-loader",
						{
							loader: "postcss-loader",
							options: {
								plugins: (loader) => [
									require("postcss-import")({ root: loader.resourcePath }),
									...(production
										? [require("postcss-preset-env"), require("cssnano")]
										: []),
								],
							},
						},
					],
				},
			],
		},
		optimization: {
			minimize: production,
			minimizer: [
				new TerserPlugin({
					terserOptions: {
						output: {
							comments: false,
						},
					},
				}),
			],
		},
		resolve: {
			extensions: [".tsx", ".ts", ".js"],
		},
		plugins: [
			new CleanWebpackPlugin({
				cleanOnceBeforeBuildPatterns: ["*"],
			}),
			new MiniCssExtractPlugin({
				filename: "app.css",
			}),
		],
	};
};
