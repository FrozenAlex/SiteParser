import Telegraf, { ContextMessageUpdate, Middleware } from "telegraf";
import Application from "koa";
import { randomString } from "../helpers";
import { getRepository, MoreThan, LessThan } from "typeorm";
import Topic from "../entity/Topic";
import { AddTopic, refreshAll } from "../monitoring/monitor";
import User from "../entity/User";
import Subscription from "../entity/Subscription";
import Post from "../entity/Post";
import * as TurndownService from "turndown";
import Comment from "../entity/Comment";

let svc = new TurndownService({
	codeBlockStyle: "fenced",
});

export const bot = new Telegraf(process.env.BOT_TOKEN);

export default function StartBot(app: Application) {
	setBotActions(bot);

	// Launch bot
	if (process.env.HOSTNAME) {
		//Launch in polling mode
		let path = process.env.SECRET_PATH || randomString(7);
		let address = "https://" + process.env.HOSTNAME + "/" + path;
		bot.telegram.setWebhook(address);

		app.use(async (ctx, next) => {
			if (ctx.method !== "POST" || ctx.url !== "/" + path) {
				return next();
			}
			// @ts-ignore
			await bot.handleUpdate(ctx.request.body, ctx.response);
			ctx.status = 200;
		});
		console.info(`Bot started on ${address} webhook`);
	} else {
		bot.launch();
		console.info(`Bot started using long polling`);
	}
}

// If admin middleware
async function isAdmin(ctx: ContextMessageUpdate, next) {
	// One permanent admin
	if (ctx.message.from.username === process.env.ADMIN_USERNAME) return await next(ctx);
	let user = await getRepository(User).findOne({
		where: {
			id: ctx.message.from.id,
			role: "admin",
		},
	});
	if (user) return await next(ctx);
	ctx.reply("Нет прав у тебя");
}

/**
 * Set actions
 * @param bot Telegram bot
 */
function setBotActions(bot: Telegraf<ContextMessageUpdate>) {
	bot.help((ctx) => {
		ctx.reply(`Бот для мониторинга сайта it-starter.ru
/help - помощь
/promote - повысить пользователя
/demote - сделать не админом
/start - регистрация (приватная команда)
/sub <имя темы> - подписать этот чат на тему
/unsub <имя темы> - отписаться от темы
/sublist - все подписки этого чата
/topic - список доступных тем
/topic add <имя темы> <адрес первой страницы> - добавить тему
/topic delete <имя темы> - удалить тему
/refresh - обновить поверхностно
/frefresh - обновить все страницы
Бот собирает обновления каждые 15 минут`);
	});
	// User signup
	bot.start(async (ctx) => {
		if (ctx.chat.type === "private") {
			// Record our new user or update
			let user = new User();
			user.id = ctx.chat.id;
			user.username = ctx.chat.username;
			await getRepository(User).save(user);
			ctx.reply(
				"Отлично, осталось запросить у админа разрешения :) \nВаш ID: " +
					ctx.message.from.id
			);
		}
	});

	// Demote user
	bot.hears(/\/promote.*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		if (!messageParts[1]) return ctx.reply("Неверный формат");
		let user = await getRepository(User).findOne({
			where: { username: messageParts[1] },
		});
		if (!user) return ctx.reply("Не нашли пользователя");
		user.role = "admin";
		await getRepository(User).save(user);

		ctx.reply(`${messageParts[1]} теперь админ!`);
	});

	// Promote the user to admin
	bot.hears(/\/demote.*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		if (!messageParts[1]) return ctx.reply("Неверный формат");
		let user = await getRepository(User).findOne({
			where: { username: messageParts[1] },
		});
		if (!user) return ctx.reply("Не нашли пользователя");
		user.role = "guest";
		await getRepository(User).save(user);

		ctx.reply(`${messageParts[1]} теперь не админ!`);
	});

	// Subscriptions to topics
	bot.hears(/\/sub\s.*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		if (messageParts[1]) {
			// get feed name
			let feed = messageParts[1];

			// Get topic
			let topic = await getRepository(Topic).findOne({ name: feed });

			if (!topic) return ctx.reply("Не найден топик");

			// Create a subscription
			let subscription = new Subscription();
			subscription.topic = topic;
			subscription.newAdminArticles = true;
			subscription.newAnnouncements = true;
			subscription.newComments = true;
			subscription.chatId = ctx.chat.id;

			let subRepo = await getRepository(Subscription).findOne({
				where: {
					topic: topic,
					chatId: ctx.chat.id,
				},
			});
			if (subRepo) return ctx.reply("Подписка уже существует");
			await getRepository(Subscription).save(subscription);
			ctx.reply(`Подписка на ${topic.name} оформлена`);
		}
	});
	bot.hears(/\/unsub .*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		if (messageParts[1]) {
			let feed = messageParts[1];
			let topic = await getRepository(Topic).findOne({
				where: {
					name: feed,
				},
			});
			let subRepo = await getRepository(Subscription).findOne({
				where: {
					topic: topic,
					chatId: ctx.chat.id,
				},
			});
			console.log(subRepo, feed, ctx.chat.id);
			if (subRepo) {
				await getRepository(Subscription).delete({
					topic: topic,
					chatId: ctx.chat.id,
				});
				// ctx.reply("Успешно отписались от " + subRepo.topic.name);
			}
		}
	});

	bot.hears(/\/sublist/, isAdmin, async (ctx) => {
		let subs = await getRepository(Subscription).find({
			where: {
				chatId: ctx.chat.id,
			},
			relations: ["topic"],
		});

		if (subs.length == 0) return ctx.reply("Подписок нет");
		let subNames = subs.map((item) => {
			return item.topic.name;
		});
		console.log("Sub names", subNames);

		ctx.reply(`Этот чат подписан на:\n${subNames.join("\n")}`);
	});

	bot.hears(/\/topic/, isAdmin, async (ctx) => {
		let topics = await getRepository(Topic).find();
		if (!topics) {
			return ctx.reply("Ошибка: проблема с доступом к БД");
		}
		console.log(topics);
		if (topics.length === 0) {
			return ctx.reply("Еще нет тем");
		}
		let list = topics.map((topic) => `${topic.name}:${topic.url}`);

		ctx.reply(`Всего топиков ${topics.length}\n${list.join("\n")}`);
	});

	// Add topic
	bot.hears(/\/topic\s+add\s.*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");

		let name = messageParts[2];
		let url = messageParts[3];

		// Check format of the command
		if (!name || !url) {
			return ctx.reply(
				"Правильный формат\n/topic add name http://it-starter.ru/content/..."
			);
		}
		// Check if topic with the same name exists
		let existingTopic = await getRepository(Topic).findOne({ name: name });
		if (existingTopic) return ctx.reply("Топик с этим именем уже существует");

		try {
			let newtopic = await AddTopic(name, url);
			if (newtopic) return ctx.reply(`Тема успешно создана.\n /sub ${newtopic.name}`);
		} catch (err) {
			ctx.reply(err.message);
		}
	});

	// Delete topic
	bot.hears(/\/topic\s+delete.*/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");

		let name = messageParts[2];

		// Check format of the command
		if (!name) {
			return ctx.reply("Правильный формат\n/topic delete имятопика");
		}
		// Check if topic with the same name exists
		let existingTopic = await getRepository(Topic).findOne({ name: name });
		if (!existingTopic) return ctx.reply(`Топика ${name} не существует`);
		try {
			let deleted = await getRepository(Topic).remove(existingTopic);
			ctx.reply(`Топик ${name} успешно удален`);
		} catch (err) {
			ctx.reply(err.message);
		}
	});

	// Refresh topics
	bot.hears(/\/refresh/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		let start = Date.now();
		await refreshAll();
		let end = Date.now();
		ctx.reply(`Статьи обновлены за ${end - start}мс.`);
	});

	// Refresh topics
	bot.hears(/\/frefresh/, isAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		let start = Date.now();
		await refreshAll(true);
		let end = Date.now();
		ctx.reply(`Статьи обновлены за ${end - start}мс.`);
	});

	// Debug function
	bot.hears(/\/me/, isAdmin, async (ctx) => {
		// if (ctx.chat.type == "private") {
		let user = await getRepository(User).findOne({
			where: {
				id: ctx.message.from.id,
			},
		});
		if (user) {
			await ctx.reply(JSON.stringify(user));
		} else ctx.reply("Не знаем еще тебя /start");
		ctx.reply(JSON.stringify(ctx.chat));
		// }
	});
}
