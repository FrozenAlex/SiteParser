require("dotenv").config();

import * as Koa from "koa";

import * as Body from "koa-body";
import * as path from "path";
import * as Pug from "koa-pug";
import * as koaStatic from "koa-static";

import { createConnection, getRepository } from "typeorm";
import Cookie from "./entity/Cookie";
import * as Router from "koa-router";
import { parseArticle, parseType, parseArticleList, cleanUpText } from "./parsers";
import { getPage } from "./auth";
import StartBot from "./bot/telegram";
import Topic from "./entity/Topic";
import Post from "./entity/Post";
import Comment from "./entity/Comment";
import Subscription from "./entity/Subscription";
import User from "./entity/User";

const app = new Koa();
app.keys = ["Very Secret Key"];

app.use(Body());

// Start telegram bot
StartBot(app);

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
	helperPath: [
		{
			moment: require("moment"),
			cleanUpText: cleanUpText
		}
	],
	basedir: __dirname + "../views",
	app: app, // Binding `ctx.render()`, equals to pug.use(app)
	cache: process.env.NODE_ENV === "production",
});

var router = new Router();
router.get("/", async (ctx, next) => {
	await ctx.render("index");
});

router.get("/topic/", async (ctx, next) => {
	let topics = await getRepository(Topic).find();

	await ctx.render("topics", { topics });
});

router.get("/topic/:name/", async (ctx, next) => {
	let name = ctx.params.name;
	let topic = await getRepository(Topic).findOne({ name: name }, {});
	if (!topic) return ctx.render("Нет такого топика")
	let posts = await getRepository(Post).find({ where: { topic: topic }, order: { lastUpdate: "DESC" } })
	if (!posts) throw new Error("Нет статей")
	topic.posts = posts;
	await ctx.render("topicArticles", { topic });
});

router.get("/a/:url/", async (ctx, next) => {
	let url = ctx.params.url;
	let post = await getRepository(Post).findOne({ url: url }, {
		relations: ['topic', 'comments']
	});

	await ctx.render("post", post);
});

router.get("/a/", async (ctx, next) => {
	let url = ctx.params.url;
	let post = await getRepository(Post).find({
		relations: ['topic', 'comments']
	});
	ctx.response.type = "application/json"
	ctx.response.body = JSON.stringify(post);
});

router.get("/c/", async (ctx, next) => {
	let url = ctx.params.url;
	let post = await getRepository(Comment).find({
		relations: ["post"]
	});
	ctx.response.type = "application/json"
	ctx.response.body = JSON.stringify(post);
});


router.get("/content/:article", async (ctx, next) => {
	let url = "http://www.it-starter.ru" + ctx.url;
	try {
		let source = await getPage(url);
		let type = parseType(source);
		if (type == "article") {
			let page = await parseArticle(source);
			await ctx.render("article", { ...page });
		} else {
			let page = parseArticleList(source);
			await ctx.render("list", { ...page });
		}
	} catch (err) {
		console.log(err);
		await ctx.render("error", {
			error: {
				message: err.message || "Ошибочка",
				code: err.code || "500",
			},
		});
	}
});

router.get("/node/:article", async (ctx, next) => {
	let url = "http://www.it-starter.ru" + ctx.url;
	try {
		let source = await getPage(url);
		let type = parseType(source);
		if (type == "article") {
			let page = await parseArticle(source);
			await ctx.render("article", { ...page });
		} else {
			let page = parseArticleList(source);
			await ctx.render("list", { ...page });
		}
	} catch (err) {
		console.log(err);
		await ctx.render("error", {
			error: {
				message: err.message || "Ошибочка",
				code: err.code || "500",
			},
		});
	}
});

router.get("/node", async (ctx, next) => {
	let url = "http://www.it-starter.ru" + ctx.url;
	try {
		let source = await getPage(url);
		let type = parseType(source);
		if (type == "article") {
			let page = await parseArticle(source);
			await ctx.render("article", { ...page });
		} else {
			let page = parseArticleList(source);
			await ctx.render("list", { ...page });
		}
	} catch (err) {
		console.log(err);
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
		entities: [Cookie, Topic, Post, Comment, Subscription, User],
		logging: process.env.NODE_ENV !== "production",
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
