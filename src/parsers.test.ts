import { readFileSync } from "fs"
import { parseArticle, parseType, parseArticleList } from "./parsers";

test("parse article", ()=>{
    let file = readFileSync(__dirname + "/../pages/article.html").toString();
    parseArticle(file);
})

test("parse article list", ()=>{
    let file = readFileSync(__dirname + "/../pages/groupArticleList.htm").toString();
    parseArticleList(file);
})

test("parse page type", ()=>{
    let articleList = readFileSync(__dirname + "/../pages/groupArticleList.htm").toString();
    let article = readFileSync(__dirname + "/../pages/article.html").toString();
    expect(parseType(articleList)).toBe("articleList")
    expect(parseType(article)).toBe("article")
})