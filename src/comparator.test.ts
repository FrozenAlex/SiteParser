import { readFileSync } from "fs";
import { parseArticle } from "./parsers";

import Post from "./entity/Post";
import { comparePosts } from "./comparator";

// Test changes parser
test("Check for changes", () => {
	let old = readFileSync(__dirname + "/../pages/article.html").toString();
	let current = readFileSync(__dirname + "/../pages/articleNew.html").toString();

	let oldArticle = parseArticle(old);
	let newArticle = parseArticle(current);

	console.log(comparePosts(oldArticle as Post, newArticle as Post));
});
