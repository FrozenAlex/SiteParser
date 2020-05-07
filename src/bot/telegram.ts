import Telegraf, { ContextMessageUpdate, Middleware } from "telegraf";
import Application from "koa";
import { randomString } from "../helpers";
import { getRepository, MoreThan, LessThan } from "typeorm";
import Topic from "../entity/Topic";
import { AddTopic, refreshAll } from "../monitoring/monitor";
import User from "../entity/User";
import Subscription from "../entity/Subscription";
import * as TurndownService from "turndown";
import { ChatMember } from "telegraf/typings/telegram-types";

let svc = new TurndownService({
	codeBlockStyle: "fenced",
});

let GroupAdmins = {};

export const bot = new Telegraf(process.env.BOT_TOKEN);

export default function StartBot(app: Application) {
	setBotActions(bot);

	// Launch bot
	if (
		process.env.HOSTNAME &&
		process.env.HOSTNAME != "" &&
		process.env.HOSTNAME != "localhost" &&
		process.env.HOSTNAME != "127.0.0.1"
	) {
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
	// ctx.reply("Только админ может это делать");
}

async function isChatAdmin(ctx: ContextMessageUpdate, next: any) {
	// If private then you are the chat admin
	if (ctx.message.chat.type == "private") {
		return await next(ctx);
	}
	// If it's a group and all members are admins
	if (ctx.chat.type == "group" || ctx.chat.type == "supergroup") {
		if (ctx.chat.all_members_are_administrators) {
			return await next(ctx);
		} else {
			// TODO: Move it to the database
			// Get admins and cache them untill restart
			if (!GroupAdmins[ctx.chat.id]) {
				GroupAdmins[ctx.chat.id] = await ctx.telegram.getChatAdministrators(ctx.chat.id);
			}
			let isAdmin = GroupAdmins[ctx.chat.id].find(
				(item: ChatMember) => item.user.id == ctx.message.from.id
			);
			if (isAdmin) {
				return await next(ctx);
			} else {
				console.log(`User does not have admin rights ${ctx.from.username}`);
			}
		}
	}
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
/subchannel <channelname> <topic>
/unsubchannel <channelname> <topic>
/channelsubs <channelname>
/opt <topic> NP NH NC HM SM CP CC
NewPosts NewHeader NewComment HeaderMatch SilentMode ChangedPost ChangedComment
/opt <topic> 1 1 1 none 1 1 1
Бот собирает обновления каждые 15 минут`);
	});
	// User signup
	bot.start(async (ctx) => {
		if (ctx.chat.type === "private") {
			// Record our new user or update
			let existing = await getRepository(User).findOne({
				where: { id: ctx.message.from.id },
			});
			if (!existing) {
				let user = new User();
				user.id = ctx.message.from.id;
				user.username = ctx.message.from.username;
				await getRepository(User).save(user);
				ctx.reply(
					"Отлично, осталось запросить у админа разрешения :) \nВаш ID: " +
					ctx.message.from.id
				);
			} else {
				ctx.reply("Пользователь уже существует");
			}
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

	/**
	 * Subscribe to a topic
	 * /sub <topic name> <
	 */
	bot.hears(/\/sub\s.*/, isChatAdmin, async (ctx) => {
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
			subscription.chatId = ctx.chat.id;

			let subRepo = await getRepository(Subscription).findOne({
				where: {
					topic: topic,
					chatId: ctx.chat.id,
				},
			});
			if (subRepo) return ctx.reply("Подписка уже существует");
			await getRepository(Subscription).save(subscription);
			ctx.reply(`Подписка на ${topic.name} оформлена
Опции подписки:
NA - ${(subscription.newPosts) ? "1" : "0"}
NH - ${(subscription.newHeader) ? "1" : "0"}
NC - ${(subscription.newComments) ? "1" : "0"}
MW - ${subscription.headerMatch}
SH - ${(subscription.silent) ? "1" : "0"}
CP - ${(subscription.changedPosts) ? "1" : "0"}
CC - ${(subscription.changedComments) ? "1" : "0"}
Для изменения воспользуйтесь /opt`);
		}
	});



	bot.hears(/\/unsub .*/, isChatAdmin, async (ctx) => {
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
				ctx.reply("Успешно отписались от " + subRepo.topic.name);
			} else {
				ctx.reply("Этой подписки уже нет")
			}
		}
	});

	bot.hears(/\/sublist/, isChatAdmin, async (ctx) => {
		let subs = await getRepository(Subscription).find({
			where: {
				chatId: ctx.chat.id,
			},
			relations: ["topic"],
		});

		if (subs.length == 0) return ctx.reply("Подписок нет");
		let subNames = subs.map((item) => {
			return item.topic.name +
				+ " " + ((item.newPosts) ? "1" : "0")
				+ " " + ((item.newHeader) ? "1" : "0")
				+ " " + ((item.newComments) ? "1" : "0")
				+ " " + item.headerMatch
				+ " " + ((item.silent) ? "1" : "0")
				+ " " + ((item.changedPosts) ? "1" : "0")
				+ " " + ((item.changedComments) ? "1" : "0")
		});
		console.log("Sub names", subNames);

		ctx.reply(`Этот чат подписан на:
NP, NH, NC, HM, SM, CP, CC\n${subNames.join("\n")}`);
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

	bot.hears(/\/topics/, isChatAdmin, async (ctx) => {
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

	// Refresh topics
	bot.hears(/\/refresh/, isChatAdmin, async (ctx) => {
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
	bot.hears(/\/me/, isChatAdmin, async (ctx) => {
		if (ctx.chat.type == "private") {
			let user = await getRepository(User).findOne({
				where: {
					id: ctx.message.from.id,
				},
			});
			if (user) {
				await ctx.reply(JSON.stringify(user));
			} else ctx.reply("Не знаем еще тебя /start");
			ctx.reply(JSON.stringify(ctx.chat));
		}
	});

	/**
	 * Subscribe public channel to a topic
	 * /subchannel <channelname> <topic> <announcement> <articles> <comments>
	 * /subchannel ChanChan 2ПМ 1 1 1
	 */
	bot.hears(/\/subchannel .*/, isAdmin, async (ctx) => {
		if (ctx.chat.type == "private") {
			let messageParts = ctx.message.text.split(" ");
			if (messageParts[1] && messageParts[2]) {
				try {
					let topicName = messageParts[2];

					// Get topic
					let topic = await getRepository(Topic).findOne({ name: topicName });
					if (!topic) return ctx.reply("Не найден топик");

					// Get chat
					let chat = await ctx.telegram.getChat(messageParts[1])
					if (!chat) return ctx.reply("Чат не найден");

					// Channel sanity check
					if (chat.type !== "channel") ctx.reply("Чат не является публичным каналом");
					let channelAdmins = await ctx.telegram.getChatAdministrators(chat.id);
					if (!channelAdmins) return ctx.reply("У канала нет админов??")

					// Check if the user is admin
					let isAdmin = channelAdmins.find(
						(item: ChatMember) => item.user.id == ctx.message.from.id
					);
					if (!isAdmin) return ctx.reply("Вы не являетесь админом этого канала");


					// Everything is checked, now add the subscription
					let subscription = new Subscription();
					subscription.topic = topic;
					subscription.chatId = chat.id;

					let subRepo = await getRepository(Subscription).findOne({
						where: {
							topic: topic,
							chatId: chat.id,
						},
					});

					if (subRepo) return ctx.reply("Подписка уже существует");
					await getRepository(Subscription).save(subscription);
					ctx.reply(`Подписка на ${topic.name} оформлена
Опции подписки:
Новые статьи - ${(subscription.newPosts) ? "Да" : "Нет"}
Новые анонсы - ${(subscription.newHeader) ? "Да" : "Нет"}
Новые комментарии - ${(subscription.newComments) ? "Да" : "Нет"}
Match-слово в анонсе - ${subscription.headerMatch}
Тихие сообщения - ${(subscription.silent) ? "Да" : "Нет"}
Измененные посты - ${(subscription.changedPosts) ? "Да" : "Нет"}
Измененные комментарии - ${(subscription.changedComments) ? "Да" : "Нет"}
Для изменения воспользуйтесь /chopt <channel> <paramName> <value>
ParamName: 
newPosts, newHeader, newComments, headerMatch, silent, changedPosts, changedComments`);
				} catch (err) {
					ctx.reply("Что-то пошло не так, проверьте данные");
					console.log(err);
				}


			} else {
				ctx.reply("Неправильный формат");
			}
		}
	});

	/**
	 * Subscribe public channel to a topic
	 * /unsubchannel <channelname> <topic>
	 * /unsubchannel ChanChan 2ПМ
	 */
	bot.hears(/\/unsubchannel.*/, isAdmin, async (ctx) => {
		if (ctx.chat.type == "private") {
			let messageParts = ctx.message.text.split(" ");
			if (messageParts[1] && messageParts[2]) {
				try {
					let topicName = messageParts[2];

					// Get topic
					let topic = await getRepository(Topic).findOne({ name: topicName });
					if (!topic) return ctx.reply("Не найден топик");

					// Get chat
					let chat = await ctx.telegram.getChat(messageParts[1])
					if (!chat) return ctx.reply("Чат не найден");

					// Channel sanity check
					if (chat.type !== "channel") ctx.reply("Чат не является публичным каналом");
					let channelAdmins = await ctx.telegram.getChatAdministrators(chat.id);
					if (!channelAdmins) return ctx.reply("У канала нет админов??")

					// Check if the user is admin
					let isAdmin = channelAdmins.find(
						(item: ChatMember) => item.user.id == ctx.message.from.id
					);
					if (!isAdmin) return ctx.reply("Вы не являетесь админом этого канала");


					// Everything is checked, now remove the subscription
					let subRepo = await getRepository(Subscription).findOne({
						where: {
							topic: topic,
							chatId: chat.id,
						},
					});

					if (!subRepo) return ctx.reply("Канал не подписан на этот топик");

					await getRepository(Subscription).delete({
						topic: topic,
						chatId: chat.id
					});

					ctx.reply("Подписка успешно отменена.")
				} catch (err) {
					ctx.reply("Что-то пошло не так, проверьте данные");
					console.log(err);
				}
			} else {
				ctx.reply("Неправильный формат");
			}
		}
	});

	/**
	 * List of channel subscriptions
	 * 
	 */
	bot.hears(/\/channelsubs.*/, isAdmin, async (ctx) => {
		if (ctx.chat.type == "private") {
			let messageParts = ctx.message.text.split(" ");
			if (messageParts[1]) {
				try {
					// Get chat
					let chat = await ctx.telegram.getChat(messageParts[1])
					if (!chat) return ctx.reply("Чат не найден");

					// Channel sanity check
					if (chat.type !== "channel") ctx.reply("Чат не является публичным каналом");
					let channelAdmins = await ctx.telegram.getChatAdministrators(chat.id);
					if (!channelAdmins) return ctx.reply("У канала нет админов??")

					// Check if the user is admin
					let isAdmin = channelAdmins.find(
						(item: ChatMember) => item.user.id == ctx.message.from.id
					);
					if (!isAdmin) return ctx.reply("Вы не являетесь админом этого канала");


					// Everything is checked, now list subs
					let subs = await getRepository(Subscription).find({
						where: {
							chatId: chat.id,
						},
						relations: ["topic"],
					});

					if (subs.length == 0) return ctx.reply("Подписок нет");
					let subNames = subs.map((item) => {
						return item.topic.name +
							+ " " + ((item.newPosts) ? "1" : "0")
							+ " " + ((item.newHeader) ? "1" : "0")
							+ " " + ((item.newComments) ? "1" : "0")
							+ " " + item.headerMatch
							+ " " + ((item.silent) ? "1" : "0")
							+ " " + ((item.changedPosts) ? "1" : "0")
							+ " " + ((item.changedComments) ? "1" : "0")
					});

					ctx.reply(`Этот канал подписан на:
NP, NH, NC, HM, SM, CP, CC\n${subNames.join("\n")}`);
				} catch (err) {
					ctx.reply("Что-то пошло не так, проверьте данные");
					console.log(err);
				}
			} else {
				ctx.reply("Неправильный формат");
			}
		}
	});

	/**
	 * Change channel option
	 * Value is optional (false if not present)
	 * 1 - true
	 * 0 - false
	 * string - string
	 * /chopt <channelid> <topic> NP NH NC HM SM CP CC
	 */
	bot.hears(/\/chopt.*/, isAdmin, async (ctx) => {
		if (ctx.chat.type == "private") {
			let messageParts = ctx.message.text.split(" ");
			if (messageParts.length == 10) {
				try {
					let topicName = messageParts[2];

					// Get topic
					let topic = await getRepository(Topic).findOne({ name: topicName });
					if (!topic) return ctx.reply("Не найден топик");

					// Get chat
					let chat = await ctx.telegram.getChat(messageParts[1])
					if (!chat) return ctx.reply("Чат не найден");

					// Channel sanity check
					if (chat.type !== "channel") ctx.reply("Чат не является публичным каналом");
					let channelAdmins = await ctx.telegram.getChatAdministrators(chat.id);
					if (!channelAdmins) return ctx.reply("У канала нет админов??")

					// Check if the user is admin
					let isAdmin = channelAdmins.find(
						(item: ChatMember) => item.user.id == ctx.message.from.id
					);
					if (!isAdmin) return ctx.reply("Вы не являетесь админом этого канала");


					// Everything is checked, now list subs
					let sub = await getRepository(Subscription).findOne({
						where: {
							chatId: chat.id,
							topic: topic
						},
						relations: ["topic"],
					});

					// Set options
					// NP, NH, NC, HM, SM, CP, CC
					sub.newPosts = messageParts[3] == "1"; // 
					sub.newHeader = messageParts[4] == "1";
					sub.newComments = messageParts[5] == "1";
					sub.headerMatch = (messageParts[6] == "none") ? "" : messageParts[6];
					sub.silent = messageParts[7] == "1";
					sub.changedPosts = messageParts[8] == "1";
					sub.changedComments = messageParts[9] == "1";

					// Save changes
					await getRepository(Subscription).save(sub);
					ctx.reply("Успешно, новые настройки:\n" +
						"NP, NH, NC, HM, SM, CP, CC\n" +
						+ ((sub.newPosts) ? "1" : "0")
						+ " " + ((sub.newHeader) ? "1" : "0")
						+ " " + ((sub.newComments) ? "1" : "0")
						+ " " + sub.headerMatch
						+ " " + ((sub.silent) ? "1" : "0")
						+ " " + ((sub.changedPosts) ? "1" : "0")
						+ " " + ((sub.changedComments) ? "1" : "0"));

				} catch (err) {
					ctx.reply("Что-то пошло не так, проверьте данные");
					console.log(err);
				}
			} else {
				ctx.reply("Неправильный формат");
			}
		}
	});

	/**
	 * Change channel option
	 * Value is optional (false if not present)
	 * 1 - true
	 * 0 - false
	 * string - string
	 * /opt <topic> NP NH NC HM SM CP CC
	 */
	bot.hears(/\/opt.*/, isChatAdmin, async (ctx) => {
		let messageParts = ctx.message.text.split(" ");
		if (messageParts.length == 9) {
			try {
				let topicName = messageParts[1];

				// Get topic
				let topic = await getRepository(Topic).findOne({ name: topicName });
				if (!topic) return ctx.reply("Не найден топик");

				// Everything is checked, now list subs
				let sub = await getRepository(Subscription).findOne({
					where: {
						chatId: ctx.chat.id,
						topic: topic
					},
					relations: ["topic"],
				});

				// Change options
				// NP, NH, NC, HM, SM, CP, CC
				sub.newPosts = messageParts[2] == "1";
				sub.newHeader = messageParts[3] == "1";
				sub.newComments = messageParts[4] == "1";
				sub.headerMatch = (messageParts[5] == "none") ? "" : messageParts[5];
				sub.silent = messageParts[6] == "1";
				sub.changedPosts = messageParts[7] == "1";
				sub.changedComments = messageParts[8] == "1";

				// Save changes
				await getRepository(Subscription).save(sub);
				ctx.reply("Успешно, новые настройки:\n" +
					"NP, NH, NC, HM, SM, CP, CC\n" +
					+ ((sub.newPosts) ? "1" : "0")
					+ " " + ((sub.newHeader) ? "1" : "0")
					+ " " + ((sub.newComments) ? "1" : "0")
					+ " " + sub.headerMatch
					+ " " + ((sub.silent) ? "1" : "0")
					+ " " + ((sub.changedPosts) ? "1" : "0")
					+ " " + ((sub.changedComments) ? "1" : "0"));

			} catch (err) {
				ctx.reply("Что-то пошло не так, проверьте данные");
				console.log(err);
			}
		} else {
			ctx.reply("Неправильный формат");
		}
	});
}
