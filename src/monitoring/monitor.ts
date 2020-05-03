import { getRepository, ChangeStream } from "typeorm";
import Topic from "../entity/Topic";
import { getPage } from "../auth";
import {
	parseType,
	parseArticleList,
	parseArticle,
	isArticle,
	removeHTML,
	cleanUpText,
} from "../parsers";
import Post from "../entity/Post";
import Comment from "../entity/Comment";
import { URL } from "url";
import { bot } from "../bot/telegram";
import { comparePosts, ComparisonResult } from "../comparator";
import Subscription from "../entity/Subscription";

var CronJob = require("cron").CronJob;

var job = new CronJob(
	"1 */15 * * * *",
	function () {
		refreshAll();
		console.log("refreshed articles");
	},
	null,
	true,
	"America/Los_Angeles"
);
job.start();

/**
 * Add a topic for monitoring
 * @param name Name of the topic
 * @param url Url of the first page
 */
export async function AddTopic(name: string, url: string) {
	let topicRepository = getRepository(Topic);

	try {
		let page = await getPage(url);
		let type = parseType(page);
		// Сheck if it's an article list or not
		if (type !== "articleList") {
			throw new Error("Неправильный тип страницы, это точно группа?");
		}
		// Get data from it
		let list = parseArticleList(page);

		// Create a new topic
		let topic = new Topic();
		topic.announcement = null;
		topic.name = name;
		topic.displayName = list.title;
		topic.url = url;

		let newTopic = await topicRepository.save(topic);

		return newTopic;
	} catch (err) {
		throw err;
	}
}

/**
 * Refresh all topics
 */
export async function refreshAll(force = false) {
	let topics = await getRepository(Topic).find({
		relations: ["posts", "subscriptions", "posts.comments"],
	});
	if (!topics) throw new Error("Что-то не то с бд");
	let result = await Promise.all(
		topics.map(async (element) => {
			await updateTopic(element, force);
		})
	);

	return result;
}

/**
 * Refresh topic
 * @param name Name of the topic
 */
export async function updateTopic(topic: Topic, force: boolean = false) {
	// Construct urls
	let url = topic.url;
	let Uri = new URL(topic.url);
	let baseUrl = `${Uri.protocol}//${Uri.hostname}`;

	// get page index
	let firstPage = await getPage(url);
	let type = parseType(firstPage);
	// Сheck if it's an article list or not
	if (type !== "articleList") {
		throw new Error("Неправильный тип страницы, это точно группа?");
	}
	// delete from comment where author="VTlu
	// Get page list
	let firstPageList = parseArticleList(firstPage);

	// Parse the pages info
	let postList = firstPageList.pages.map((page) => {
		let post = new Post();
		post.author = page.author;
		post.commentCount = page.commentCount;
		post.excerpt = page.excerpt;
		post.originalUrl = baseUrl + page.link;
		post.lastUpdate = page.date;
		post.title = page.title;
		post.topic = topic;
		return post;
	});

	// Existing articles
	let existingPosts = topic.posts;

	// Find new articles
	let newPosts = postList.filter((post) => {
		let exists = !!existingPosts.find((item) => post.originalUrl == item.originalUrl);
		return !exists;
	});

	// Check for updates in posts
	let updates;
	if (!force) {
		updates = postList.filter((post) => {
			let existingPost = existingPosts.find(
				(item) => post.originalUrl == item.originalUrl
			);
			if (existingPost) {
				let updatedDate =
					post.lastUpdate?.getTime() != existingPost.lastUpdate?.getTime();
				let updatedCommentCount = post.commentCount !== existingPost.commentCount;
				if (updatedDate || updatedCommentCount) {
					// Add id to the new post
					post.id = existingPost.id;
					return true;
				}
			}
			return false;
		});
	} else {
		updates = postList;
	}

	// Get pages (enrich those update)
	updates = (await getPosts(updates)) as Post[]; // Ignore no ids.
	// Filter posts again if force is on
	if (force) {
		updates = updates.filter((post: Post) => {
			let existingPost = existingPosts.find(
				(item) => post.originalUrl == item.originalUrl
			);
			if (existingPost) {
				let result = comparePosts(existingPost, post);
				return (
					result.changedDate ||
					result.newComments.length > 0 ||
					result.updatedComments.length > 0
				);
			}
		});
	}

	// getChanges
	let changes = updates.map((post: Post) => {
		let existingPost = existingPosts.find((item) => post.originalUrl == item.originalUrl);
		if (existingPost) {
			post.id = existingPost.id; // Fix id for the post
			post.url = existingPost.url;
			return comparePosts(existingPost, post);
		}
	});

	// Get new posts from the website
	newPosts = (await getPosts(newPosts)) as Post[];

	// Save updates
	await Promise.all(
		changes.map(async (change: ComparisonResult) => {
			change.post.commentCount = change.post.comments ? change.post.comments.length : 0;
			await getRepository(Post).save(change.post);
			return change.post.comments.map(async (comment) => {
				return getRepository(Comment).save(comment);
			});
		})
	);

	// Save new posts
	let results = await Promise.all(
		newPosts.map(async (post) => {
			post.topic = topic;
			let item = await getRepository(Post).save(post);
			await Promise.all(
				post.comments.map(async (comment) => {
					return getRepository(Comment).save(comment);
				})
			);
			return item;
		})
	);

	let newHeader = null;
	// Get header changes
	if (firstPageList.header != topic.announcement) {
		newHeader = firstPageList.header;
		topic.announcement = newHeader;
		// save the header change
		await getRepository(Topic).update(
			{ id: topic.id },
			{
				announcement: newHeader,
			}
		);
	}

	await notifyUsers(changes, results, newHeader, topic);

	return {
		changes,
		newPosts,
		newHeader,
	};
}

/**
 * Get all of the posts based on article things
 * @param articleHeaders Article headers
 */
export async function getPosts(articleHeaders: Partial<Post>[]) {
	// Get the content of new posts
	let newPosts = await Promise.all(
		articleHeaders.map(async (post) => {
			// Get page
			let html = await getPage(post.originalUrl);

			// Parsing type of the page
			if (!isArticle(html)) {
				console.error("not an article");
				return null;
			}
			// Add properties to post
			let article = parseArticle(html, post);
			return article;
		})
	);
	return newPosts;
}

/**
 * Notify users about new changes
 * @param changes
 * @param newPosts
 */
export async function notifyUsers(
	changes: ComparisonResult[],
	newPosts: Post[],
	newHeader = "",
	topic: Topic
) {
	let commonMessage = "";
	// Get all subbed on a current topic
	let subs = await getRepository(Subscription).find({
		where: {
			topic: topic,
		},
	});

	// New header
	if (newHeader) {
		commonMessage += "*Новый заголовок*:\n" + cleanUpText(newHeader) + "\n";
	}

	if (newPosts && newPosts.length != 0) {
		let newArticlesText = "*Новые статьи*:\n";
		// Notify about new posts
		let texts = newPosts.map((post) => {
			return `[${post.title}](${getArticleUrl(post.url)})`;
		});
		newArticlesText += texts.join("\n");
		commonMessage += newArticlesText + "\n";
	}

	// Get changes
	if (changes && changes.length != 0) {
		let updatesMessage = "*Изменения*: \n";
		// Message about changes
		changes.forEach((change) => {
			let header = `[${change.post.title}](${getArticleUrl(change.post.url)}): \n`;

			// if new comment
			if (change.newContent) {
				header += `Новый контент:\n` + removeHTML(change.newContent) + "\n";
			}

			// if new comment
			if (change.newComments && change.newComments.length > 0) {
				let commments = change.newComments.map((comment) => {
					return `${comment.title}: ${comment.author}`;
				});
				header += `Новые комментарии:\n` + commments.join("\n") + "\n";
			}
			// if changed comment
			if (change.updatedComments && change.updatedComments.length > 0) {
				let commments = change.updatedComments.map((comment) => {
					return `${comment.title}: ${comment.author}`;
				});
				header += `Измененные комментарии:\n` + commments.join("\n") + "\n";
			}
			updatesMessage += header;
		});

		// Add to the main message
		commonMessage += updatesMessage;
	}

	if (commonMessage) {
		subs.forEach((sub) => {
			bot.telegram.sendMessage(sub.chatId, commonMessage, {
				parse_mode: "Markdown",
			});
		});
	}
}

export function getArticleUrl(id: string) {
	return "https://" + process.env.HOSTNAME + "/a/" + id;
}
