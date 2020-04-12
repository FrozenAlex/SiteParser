import parse, { HTMLElement } from "node-html-parser";
const moment = require("moment");

const dateFormat = /(\d\d\/\d\d\/\d{4}\s-\s\d\d:\d\d)/g;
const nameFormat = /— ([А-яA-z .]+)/;

interface Page {
	slug?: string;
	type: "article" | "articleList" | "groupList";
	title: string;
	date?: Date;
	content?: string;
	excerpt?: string;
	author?: string;
	comments?: Array<Comment>;
	commentCount?: number;
}

interface PageList {
	title: string;
	pages?: Page[];
	currentPage?: number;
}

interface Comment {
	id?: number;
	title?: string;
	date?: Date;
	author?: string;
	content?: string;
}

export function parseSubmission(submitted: string) {
	let parsedDate = submitted.match(/(\d\d\/\d\d\/\d{4}\s-\s\d\d:\d\d)/g);
	let parsedAuthor = submitted.match(/— ([А-яA-z ]+)/);
	let submissionDate = moment(parsedDate[0], "DD/MM/YYYY - HH:mm").toDate();

	let author = parsedAuthor[1];
	return {
		date: submissionDate,
		author: author,
	};
}

export function parseType(text: string) {
	let html = parse(text) as HTMLElement;
	let link = html.querySelector("head link");
	if (link.getAttribute("type") === "application/rss+xml") {
		return "articleList";
	} else return "article";
}

export function parseArticle(text: string) {
	try {
		let html = parse(text) as HTMLElement;

		// Parse article title
		let titleElement = html.querySelector("head title");
		let title = titleElement.text.replace(" | IT- STARTER", ""); // Remove it starter from it

		// Parse page header with warnings
		let headerElement = html.querySelector("#header-region");
		let header = headerElement.structuredText;

		// Parse date and author of submission
		let submittedElement = html.querySelector(".meta .submitted");
		let submitted = submittedElement.text;

		// let submissionDate, author;
		let { date, author } = parseSubmission(submitted);

		// parse content of the article and remove voting widget
		let contentElement = html.querySelector(".node.sticky.clear-block .content");
		contentElement.removeChild(contentElement.querySelector(".fivestar-widget")); 
		let content = contentElement.innerHTML;

		// parse comments
		let commentsElement = html.querySelectorAll("#comments .comment");

		let comments: Comment[] = commentsElement.map((element, index, array) => {
			// Get comment title and unique id
			let titleElement = element.querySelector("h3 a");
			let title = titleElement.text;
			let id = parseInt(titleElement.getAttribute("href").match(/#comment-(\d+)/)[1]);

			// Parse submission details
			let submittedElement = element.querySelector(".submitted");
			let submittedText = submittedElement.text;
			let { date, author } = parseSubmission(submittedText);

			// Get comment content
			// TODO: Remove not needed html tags and clean it up
			let contentElement = element.querySelector(".content");
			contentElement.removeChild(contentElement.querySelector(".fivestar-widget")); 
			let content = contentElement.innerHTML;
			return {
				id,
				title,
				date,
				author,
				content,
			};
		});

		let page: Page = {
			type: "article",
			title: title,
			date: date,
			author: author,
			content: content,
			comments: comments,
		};

		// console.log(page)
		return page;
	} catch (err) {
		console.log(err);
		if (err.response) {
			throw { code: err.response.status, message: "Ошибка" };
		}
	}
}

export function parseArticleList(text: string) {
	let html = parse(text) as HTMLElement;

	// Parse list title
	let titleElement = html.querySelector("head title");
	let title = titleElement.text.replace(" | IT- STARTER", ""); // Remove it starter from it

	// Parse pagination
	let paginationElement = html.querySelector(".pager");
	let currentPage = parseInt(paginationElement.querySelector(".pager-current").text);

	// Counts from zero and if there's no last page element then we're on the last page
	let pagesCount = currentPage;
	let lastPageElement = paginationElement.querySelector(".pager-last a");
	if (lastPageElement) {
		pagesCount =
			parseInt(lastPageElement.getAttribute("href").match(/page=(\d+)/)[1]) + 1;
	}

	// Parse pages list
	let content = html.querySelectorAll(".view-content .views-row div");
	let pages = content.map((element: HTMLElement) => {
		let titleElement = element.querySelector("h2 a");
		let title = titleElement.text;
		let link = titleElement.getAttribute("href");

		// Parse submission details if they exist
		let submittedElement = element.querySelector(".submitted");
		let date, author;
		if (submittedElement) {
			let parsedSubmission = parseSubmission(submittedElement.text);
			date = parsedSubmission.date;
			author = parsedSubmission.author;
		}

		// Parse excerpt and remove rating
		let contentElement = element.querySelector(".content");
		contentElement.removeChild(contentElement.querySelector(".fivestar-widget")); 
		let excerpt = contentElement.innerHTML;
		
		// Parse amount of comments
		let countElement = element.querySelector(".comment_comments.last");
		let commentCount = 0;
		if (countElement) {
			commentCount = parseInt(countElement.text.match(/(\d+)/)[1]);
		}

		return {
			link,
			title,
			date,
			author,
			excerpt,
			commentCount,
		};
	});

	return {
		title,
		pages: pages,
		currentPage,
		pagesCount,
	};
}
