require("dotenv").config();

import * as Koa from "koa";

import * as Body from "koa-body";
import * as path from "path";
import * as Pug from "koa-pug";
import * as koaStatic from "koa-static";

import Axios from "axios";
import { parse, HTMLElement } from "node-html-parser";
import getAuthCookie, { fakeHeaders } from "./auth";
import { createConnection } from "typeorm";
import { Cookie } from "./entity/Cookie";
import * as Router from "koa-router";

let credentials = {
	username: process.env.USERNAME,
	password: process.env.PASSWORD,
};

console.log(credentials)
// URL
//

async function parseMainArticlesPage(
	url = "http://www.it-starter.ru/content/%D0%B0%D0%B3%D1%8320181%D0%BF%D0%BC1"
) {
	let cookie = await getAuthCookie(credentials);
	console.log(cookie)
	try {
		let result = await Axios.get(url, {
			headers: {
				...fakeHeaders,
				Cookie: cookie.value,
			},
		});

		let html = parse(result.data);

		// Assume that it's a list
		let page = {
			type: "list",
			content: null
		}

		page.content = (html as HTMLElement).querySelector(".view-content");
		if (!page.content) {
			page.type = "article";
			page.content = (html as HTMLElement).querySelector(".right-corner .left-corner");
		}
		return page;
	} catch (err) {
		console.log(err)
		if (err.response) {
			throw { code: err.response.status, message: "Ошибка" };
		}
	}
}

const app = new Koa();
app.keys = ["Very Secret Key"];

app.use(Body());

// Serve static content
app.use(
	koaStatic(path.resolve(__dirname, "../public"), {
		gzip: process.env.NODE_ENV === "production",
		brotli: process.env.NODE_ENV === "production",
	})
);

var compress = require("koa-compress");
app.use(compress());

// @ts-ignore
const pug = new Pug({
	viewPath: path.resolve(__dirname, "./../views"),
	locals: {
		/* variables and helpers */
	},
	basedir: __dirname + "../views",
	app: app, // Binding `ctx.render()`, equals to pug.use(app)
	cache: process.env.NODE_ENV === "production",
});

var router = new Router();
router.get("/", async (ctx, next) => {
	await ctx.render("index");
});
router.get("/content/:article", async (ctx, next) => {
	let url = "http://www.it-starter.ru" + ctx.url;

	try {
		let page = await parseMainArticlesPage(url);
		console.log(page)
		await ctx.render("content", { content: page.content });
	} catch (err) {
		console.log(err)
		await ctx.render("error", {
			error: {
				message: err.message || "Ошибочка",
				code: err.code || "500",
			},
		});
	}
});
app.use(router.routes());

async function main() {
	// @ts-ignore
	await createConnection({
		entities: [Cookie],
		// logging: process.env.NODE_ENV !== "production",
		synchronize: true,
		type: process.env.DB_TYPE || "sqlite",
		database: process.env.DB_NAME || __dirname + `/../data/db.sqlite`,
		host: process.env.DB_HOST,
		port: process.env.DB_PORT,
		username: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
	});

	app.listen(process.env.PORT || 3000, () => {
		console.log(`Koa has started on http://localhost:${process.env.PORT || 3000}`);
	});
}
main();
